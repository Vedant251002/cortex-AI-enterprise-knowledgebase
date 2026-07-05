// Cortex UC1 - infrastructure as code for all 8 Azure resources.
//
// Deployed at RESOURCE GROUP scope - create the resource group first (matches the manual
// `az group create` step in the README's Azure Provisioning Guide), then:
//
//   az deployment group create \
//     --resource-group rg-cortex \
//     --template-file infra/main.bicep \
//     --parameters infra/main.parameters.json
//
// Region layout mirrors the README exactly: most resources default to South India, with
// Document Intelligence in Central India (FormRecognizer kind unsupported in South India) and
// Cosmos DB in West US 2 (free-tier capacity fallback). Override any of the three location
// params if your subscription's regional availability differs.
//
// This template does not deploy the Azure AI Search index schema (kb-chunks) - that's created
// once by scripts/create_search_index.py after the Search service exists (see README).

@description('Base name used to derive every resource name (must be globally-unique-safe on its own for Storage/Cosmos/Search/Cognitive Services - a short suffix is appended per resource type).')
param baseName string = 'cortex'

@description('Primary region for OpenAI, Search, Storage, Content Safety, Key Vault, and Application Insights.')
param primaryLocation string = 'southindia'

@description('Region for Document Intelligence (FormRecognizer kind is not available in every region).')
param documentIntelligenceLocation string = 'centralindia'

@description('Region for Cosmos DB (free-tier account creation can be capacity-constrained in some regions).')
param cosmosLocation string = 'westus2'

@description('Azure OpenAI chat deployment model name.')
param chatModelName string = 'gpt-5-mini'

@description('Azure OpenAI embedding deployment model name.')
param embeddingModelName string = 'text-embedding-3-small'

@description('Tags applied to every resource for cost tracking / ownership.')
param tags object = {
  project: 'cortex-uc1'
  managedBy: 'bicep'
}

var openAiAccountName = '${baseName}-openai'
var searchServiceName = '${baseName}-search'
var docIntelAccountName = '${baseName}-docintel'
var storageAccountName = replace('${baseName}storage', '-', '')
var cosmosAccountName = '${baseName}-cosmos'
var contentSafetyAccountName = '${baseName}-contentsafety'
var keyVaultName = '${baseName}-kv'
var logAnalyticsWorkspaceName = '${baseName}-logs'
var appInsightsName = '${baseName}-appinsights'
var cosmosDatabaseName = baseName
var blobContainerName = 'documents'

// --------------------------------------------------------------------------- Azure OpenAI

resource openAiAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiAccountName
  location: primaryLocation
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiAccountName
    publicNetworkAccess: 'Enabled'
  }
}

resource chatDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAiAccount
  name: chatModelName
  sku: {
    name: 'Standard'
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: chatModelName
      version: '1'
    }
  }
}

resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAiAccount
  name: embeddingModelName
  sku: {
    name: 'Standard'
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: embeddingModelName
      version: '1'
    }
  }
  dependsOn: [
    chatDeployment // deployments on the same account must be created sequentially
  ]
}

// --------------------------------------------------------------------------- Azure AI Search

resource searchService 'Microsoft.Search/searchServices@2024-06-01-preview' = {
  name: searchServiceName
  location: primaryLocation
  tags: tags
  sku: {
    name: 'basic'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    semanticSearch: 'standard' // required for the semantic ranker used by hybrid_search()
  }
}

// --------------------------------------------------------------------------- Document Intelligence

resource documentIntelligenceAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: docIntelAccountName
  location: documentIntelligenceLocation
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: 'F0'
  }
  properties: {
    customSubDomainName: docIntelAccountName
    publicNetworkAccess: 'Enabled'
  }
}

// --------------------------------------------------------------------------- Blob Storage

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: primaryLocation
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: blobContainerName
  properties: {
    publicAccess: 'None'
  }
}

// --------------------------------------------------------------------------- Cosmos DB

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-08-15' = {
  name: cosmosAccountName
  location: cosmosLocation
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: cosmosLocation
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-08-15' = {
  parent: cosmosAccount
  name: cosmosDatabaseName
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource auditLogsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: cosmosDatabase
  name: 'audit_logs'
  properties: {
    resource: {
      id: 'audit_logs'
      partitionKey: {
        paths: ['/user_id']
        kind: 'Hash'
      }
    }
    options: {
      throughput: 400
    }
  }
}

resource userUsageContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: cosmosDatabase
  name: 'user_usage'
  properties: {
    resource: {
      id: 'user_usage'
      partitionKey: {
        paths: ['/user_id']
        kind: 'Hash'
      }
    }
    options: {
      throughput: 400
    }
  }
}

// --------------------------------------------------------------------------- Content Safety

resource contentSafetyAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: contentSafetyAccountName
  location: primaryLocation
  tags: tags
  kind: 'ContentSafety'
  sku: {
    name: 'F0'
  }
  properties: {
    customSubDomainName: contentSafetyAccountName
    publicNetworkAccess: 'Enabled'
  }
}

// --------------------------------------------------------------------------- Key Vault

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: primaryLocation
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true // assign "Key Vault Secrets User" to the app's managed identity post-deploy
    accessPolicies: []
  }
}

// --------------------------------------------------------------------------- Application Insights

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: primaryLocation
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: primaryLocation
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

// --------------------------------------------------------------------------- Outputs
// Feed these directly into backend/.env (see README's Azure Provisioning Guide).

output azureOpenAiEndpoint string = openAiAccount.properties.endpoint
output azureSearchEndpoint string = 'https://${searchService.name}.search.windows.net'
output azureDocIntelEndpoint string = documentIntelligenceAccount.properties.endpoint
output azureStorageAccountName string = storageAccount.name
output azureCosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output azureContentSafetyEndpoint string = contentSafetyAccount.properties.endpoint
output azureKeyVaultUrl string = keyVault.properties.vaultUri
output applicationInsightsConnectionString string = appInsights.properties.ConnectionString

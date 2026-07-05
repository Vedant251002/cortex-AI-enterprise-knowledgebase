# Infrastructure as Code (Bicep)

`main.bicep` provisions all 8 Azure resources described in the root [README's Azure
Provisioning Guide](../README.md#azure-provisioning-guide) declaratively, as a bonus alternative
to running the `az cli` commands one at a time. Resource names, SKUs, and regions match that
guide exactly (South India for most resources, Central India for Document Intelligence, West US 2
for Cosmos DB free tier).

**Not included:** the Azure AI Search index schema (`kb-chunks`) - that's created once via
`python scripts/create_search_index.py` after the Search service exists, same as the manual
`az cli` path. API keys are also not written anywhere by this template (Bicep outputs
intentionally expose only endpoints/URLs, never secrets); fetch keys with `az ... keys list`
per resource, or provision them into the deployed Key Vault yourself and enable
`AZURE_KEY_VAULT_URL` (see root README's Key Vault section).

## Deploy

```bash
az login
az group create --name rg-cortex --location southindia

az deployment group validate \
  --resource-group rg-cortex \
  --template-file main.bicep \
  --parameters main.parameters.json

az deployment group create \
  --resource-group rg-cortex \
  --template-file main.bicep \
  --parameters main.parameters.json
```

Every resource name is derived from `baseName` (default `cortex`) — override it in
`main.parameters.json` if that name (or its derived Storage/Cosmos/Search/Cognitive Services
names) isn't globally available; those services require globally-unique names.

## After deployment

1. Read the endpoint outputs (`az deployment group show --resource-group rg-cortex --name main
   --query properties.outputs`) into `backend/.env`.
2. Fetch each resource's key (`az cognitiveservices account keys list`, `az search admin-key
   show`, `az storage account keys list`, `az cosmosdb keys list`, ...) into the corresponding
   `.env` variable — or provision them as Key Vault secrets and set `AZURE_KEY_VAULT_URL` +
   leave the `.env` `*_key` fields as fallback placeholders (see root README).
3. Run `python scripts/create_search_index.py` once to create the `kb-chunks` index.
4. If using managed identity (`AZURE_USE_MANAGED_IDENTITY=true`), assign the compute identity
   the `Key Vault Secrets User` role on the deployed vault, plus the relevant data-plane roles
   on Search/Storage/Cosmos/Cognitive Services (e.g. `Cognitive Services OpenAI User`, `Storage
   Blob Data Contributor`, `Cosmos DB Built-in Data Contributor`).

## Validate without deploying

```bash
az bicep build --file main.bicep --stdout > /dev/null   # syntax check only
```

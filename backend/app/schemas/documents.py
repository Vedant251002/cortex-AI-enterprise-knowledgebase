from pydantic import BaseModel


class DeleteResponse(BaseModel):
    id: str
    status: str


class UpdateCategoryRequest(BaseModel):
    category: str

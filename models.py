from pydantic import BaseModel, Field

class DebateRequest(BaseModel):
    argument: str = Field(..., min_length=1, max_length=4000, description="The user's argument, opinion, or pitch")
    tone: str = Field(default="academic", description="gentle, academic, or aggressive")
    difficulty: str = Field(default="Intermediate", description="Beginner, Intermediate, or Expert")
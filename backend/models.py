from pydantic import BaseModel, Field


class TestStep(BaseModel):
    step_number: int
    description: str = Field(description="What to do in this step")
    success_criteria: str = Field(description="How to know this step passed")


class TestPlan(BaseModel):
    tinyfish_goal: str = Field(description="The full TinyFish goal prompt with numbered STEP instructions and JSON output format")
    steps: list[TestStep] = Field(description="Discrete steps for tracking/display (mirrors the STEP instructions)")
    total_steps: int


class StepResult(BaseModel):
    step_number: int
    passed: bool
    details: str = Field(description="What happened during this step")
    retry_count: int = 0


class BrowserResult(BaseModel):
    success: bool
    step_results: list[StepResult] = Field(description="Per-step breakdown from TinyFish result")
    raw_result: str | None = Field(default=None, description="Raw JSON string from TinyFish")
    streaming_url: str | None = Field(default=None, description="TinyFish live browser preview URL")
    error: str | None = None


class TestResult(BaseModel):
    passed: bool
    duration_ms: int = 0
    steps_passed: int
    steps_total: int
    details: str = Field(description="Overall assessment of the test")
    step_results: list[StepResult] = Field(description="Per-step breakdown")
    error: str | None = Field(default=None, description="Error details if failed")

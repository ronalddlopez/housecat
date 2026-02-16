from pydantic import BaseModel, Field


class TestStep(BaseModel):
    step_number: int
    description: str = Field(description="What to do in this step")
    success_criteria: str = Field(description="How to know this step passed")
    tinyfish_goal: str = Field(description="The TinyFish goal prompt for just this step, including JSON output format")


class TestPlan(BaseModel):
    tinyfish_goal: str = Field(description="The full TinyFish goal prompt with numbered STEP instructions and JSON output format")
    steps: list[TestStep] = Field(description="Discrete steps for tracking/display (mirrors the STEP instructions)")
    total_steps: int


class StepResult(BaseModel):
    step_number: int
    passed: bool
    details: str = Field(description="What happened during this step")
    retry_count: int = 0


class StepExecution(BaseModel):
    step_number: int
    description: str = Field(description="What this step does")
    tinyfish_goal: str = Field(description="The single-step goal sent to TinyFish")
    tinyfish_raw: str | None = Field(default=None, description="Raw JSON string from TinyFish for this step")
    tinyfish_data: dict | None = Field(default=None, description="Parsed TinyFish result for this step")
    streaming_url: str | None = Field(default=None, description="TinyFish streaming URL for this step")
    passed: bool = False
    details: str = ""
    error: str | None = None


class BrowserResult(BaseModel):
    success: bool
    step_results: list[StepResult] = Field(description="Per-step pass/fail breakdown")
    step_executions: list[StepExecution] = Field(default_factory=list, description="Per-step TinyFish execution data")
    raw_result: str | None = Field(default=None, description="Combined raw result (legacy, kept for compat)")
    streaming_url: str | None = Field(default=None, description="Last TinyFish streaming URL (legacy)")
    error: str | None = None


class TestResult(BaseModel):
    passed: bool
    duration_ms: int = 0
    steps_passed: int
    steps_total: int
    details: str = Field(description="Overall assessment of the test")
    step_results: list[StepResult] = Field(description="Per-step breakdown")
    error: str | None = Field(default=None, description="Error details if failed")


class CreateTestSuite(BaseModel):
    name: str = Field(min_length=1, max_length=100, description="Test suite name")
    url: str = Field(description="Target URL to test")
    goal: str = Field(min_length=1, description="Natural language test description")
    schedule: str = Field(default="*/15 * * * *", description="Cron expression for scheduling")
    alert_webhook: str | None = Field(default=None, description="Webhook URL for failure alerts")


class UpdateTestSuite(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    url: str | None = None
    goal: str | None = Field(default=None, min_length=1)
    schedule: str | None = None
    alert_webhook: str | None = None
    status: str | None = Field(default=None, pattern="^(active|paused)$")


class TestSuiteResponse(BaseModel):
    id: str
    name: str
    url: str
    goal: str
    schedule: str
    schedule_id: str | None = None
    alert_webhook: str | None = None
    status: str = "active"
    last_result: str = "pending"
    last_run_at: str | None = None
    created_at: str
    updated_at: str


class TestSuiteListResponse(BaseModel):
    tests: list[TestSuiteResponse]
    total: int

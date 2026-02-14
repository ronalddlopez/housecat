import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FlaskConical, Plus, Play } from "lucide-react";
import { Link } from "wouter";

export default function TestsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Tests</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your test suites and view results
          </p>
        </div>
        <Button disabled data-testid="button-new-test">
          <Plus className="h-4 w-4" />
          New Test
        </Button>
      </div>

      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="rounded-md bg-muted p-3">
              <FlaskConical className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold" data-testid="text-empty-state">
                No test suites created yet
              </p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Run a quick test to try the pipeline, or create your first test suite when this feature is available.
              </p>
            </div>
            <Button variant="outline" asChild data-testid="link-run-test">
              <Link href="/run">
                <Play className="h-4 w-4" />
                Run a Quick Test
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

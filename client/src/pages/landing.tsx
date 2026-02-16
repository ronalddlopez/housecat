import { SignInButton, SignUpButton, useAuth } from "@clerk/clerk-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Cat,
  CheckCircle2,
  Zap,
  Calendar,
  Bot,
  Code,
  PlayCircle,
  Shield,
  ArrowRight,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setLocation("/dashboard");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-md bg-primary/10 p-1.5">
              <Cat className="h-6 w-6 text-primary" />
            </div>
            <span className="font-bold text-xl tracking-tight">HouseCat</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Get Started</Button>
            </SignUpButton>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Zap className="h-4 w-4" />
            AI-Powered QA Testing Agent
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
            CodeRabbit for{" "}
            <span className="text-primary">QA</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Describe tests in plain English. Three AI agents plan, execute in a
            real browser, and evaluate results — all on a schedule. No code
            required.
          </p>
          <div className="flex items-center gap-3 justify-center flex-wrap pt-4">
            <SignUpButton mode="modal">
              <Button size="lg" className="gap-2">
                Start Testing Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </SignUpButton>
            <Button size="lg" variant="outline" asChild>
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Example prompt */}
      <section className="px-4 sm:px-6 pb-16">
        <div className="max-w-3xl mx-auto">
          <Card className="bg-muted/50 border-dashed">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-2 font-medium">
                Example test:
              </p>
              <p className="text-base italic text-foreground/80">
                "Go to the homepage, verify the navigation bar has a Login link,
                click it, and confirm the login form loads with email and
                password fields."
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How It Works — 3-agent pipeline */}
      <section id="how-it-works" className="py-16 px-4 sm:px-6 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight">
              Multi-Agent Pipeline
            </h2>
            <p className="text-muted-foreground mt-2">
              Three specialized AI agents work together on every test run
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="rounded-lg bg-blue-500/10 p-3 w-fit">
                  <Code className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">1. Planner Agent</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Claude Haiku converts your plain English goal into numbered,
                    executable browser automation steps.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="rounded-lg bg-emerald-500/10 p-3 w-fit">
                  <PlayCircle className="h-6 w-6 text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">2. Browser Agent</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    TinyFish executes each step in a real browser, streaming a
                    live preview and collecting evidence.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="rounded-lg bg-purple-500/10 p-3 w-fit">
                  <CheckCircle2 className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">3. Evaluator Agent</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Claude Haiku compares expected vs. actual results and
                    delivers a pass/fail verdict with details.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything You Need for Automated QA
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6 flex gap-4">
                <Calendar className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold">Scheduled Monitoring</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    QStash cron scheduling runs your tests every 5 minutes to
                    daily — with failure alerts to Slack or Discord.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex gap-4">
                <Bot className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold">Claude AI Agents</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Powered by pydantic-ai with Anthropic Claude Haiku 4.5 for
                    fast, reliable test planning and evaluation.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex gap-4">
                <Shield className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold">Live Execution Tracking</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Watch test execution in real-time with step-by-step progress,
                    phase indicators, and a live event log.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex gap-4">
                <Zap className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold">No Code Required</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    No Selenium scripts, no Cypress tests. Describe what to
                    verify and let AI handle the rest.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-16 px-4 sm:px-6 bg-muted/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Built With
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            {[
              "React 18",
              "FastAPI",
              "Anthropic Claude",
              "TinyFish",
              "Upstash Redis",
              "QStash",
              "Playwright",
              "pydantic-ai",
            ].map((tech) => (
              <span
                key={tech}
                className="px-3 py-1.5 rounded-full bg-background border text-muted-foreground font-medium"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to Automate Your QA?
          </h2>
          <p className="text-muted-foreground text-lg">
            Built for the February 2026 Online Open Source Agents Hackathon
          </p>
          <SignUpButton mode="modal">
            <Button size="lg" className="gap-2">
              Start Testing Now
              <ArrowRight className="h-4 w-4" />
            </Button>
          </SignUpButton>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Cat className="h-4 w-4" />
            <span>HouseCat</span>
          </div>
          <p>February 2026 Online Open Source Agents Hackathon</p>
        </div>
      </footer>
    </div>
  );
}

import { ArrowRight, CheckCircle2, FileDown, Layers, ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../components/ui/badge';
import { buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

const FEATURES = [
  {
    icon: Layers,
    title: 'Structured Daily Entries',
    description:
      'Log support calls, communication updates, and field visits into canonical report sections with clear serial ordering.',
  },
  {
    icon: ListChecks,
    title: 'Persistent Follow-up Tracking',
    description:
      'Carry forward open follow-up items automatically across daily reports and update or promote tasks in one click.',
  },
  {
    icon: FileDown,
    title: 'One-Click PDF & DOCX Export',
    description:
      'Finalize daily logs and export formatted, print-ready PDF and Word documents with team branding.',
  },
];

export function LandingScreen() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-t-[3px] border-t-primary border-b border-b-zinc-800 bg-zinc-950 text-white shadow-sm">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-white px-2.5">
              <img
                src="/default-logo.png"
                alt="Solution Art"
                className="h-6 w-auto object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white">CGHQ Work Log</span>
              <span className="text-[11px] text-zinc-400">Daily Team Reporting</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className:
                  'border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white',
              })}
            >
              Sign In
            </Link>
            <Link to="/today" className={buttonVariants({ variant: 'default', size: 'sm' })}>
              Open Work Log
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="bg-grid-subtle flex flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mx-auto grid w-full max-w-[1100px] gap-8">
          {/* Hero Card */}
          <Card className="overflow-hidden border-t-4 border-t-primary shadow-md">
            <CardContent className="grid gap-6 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div className="grid gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="default" size="sm">
                    Solution Art · CGHQ
                  </Badge>
                  <Badge variant="dark" size="sm">
                    Daily Work Report
                  </Badge>
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-4xl">
                  Team Daily Work Log &amp; Report Workspace
                </h1>

                <p className="max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base">
                  Record daily support, communication, and project progress in one structured place,
                  manage ongoing follow-ups, and export finalized PDF &amp; DOCX reports in seconds.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Link
                    to="/today"
                    className={buttonVariants({ variant: 'default', size: 'default' })}
                  >
                    Go to Work Log
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/login"
                    className={buttonVariants({ variant: 'dark', size: 'default' })}
                  >
                    Team Sign In
                  </Link>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm">
                <div className="mb-3 flex items-center justify-between border-b border-zinc-800 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Workflow Ready
                  </span>
                  <Badge variant="default" size="sm">
                    Live
                  </Badge>
                </div>
                <ul className="grid gap-3 text-sm text-zinc-200">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Pre-configured Support, Communication &amp; Visit sections</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Real-time live document preview as entries are added</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Instant PDF &amp; Word (.docx) export after finalization</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* 3-Column Feature Strip */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <Card key={feat.title} className="border-t-2 border-t-zinc-950">
                  <CardContent className="grid gap-2.5 p-5">
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-zinc-950 text-white">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-sm font-bold text-zinc-950">{feat.title}</h2>
                    <p className="text-xs leading-relaxed text-zinc-600">{feat.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

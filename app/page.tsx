import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const projectSteps = [
  "Describe the course",
  "Add source material",
  "Generate a Kyron draft",
] as const;

export default function HomePage() {
  return (
    <main className="bg-paper text-ink relative isolate min-h-screen overflow-hidden p-4 min-[521px]:p-[22px] min-[821px]:p-8">
      <div
        className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(rgba(15,44,57,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,44,57,0.035)_1px,transparent_1px)] bg-[size:42px_42px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-[180px] -right-20 -z-10 h-[430px] w-[430px] rounded-full bg-[radial-gradient(circle,rgba(217,243,106,0.72),transparent_68%)] opacity-80 blur-[1px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-[280px] -left-[130px] -z-10 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(244,193,138,0.5),transparent_67%)] opacity-80 blur-[1px]"
        aria-hidden="true"
      />

      <section
        className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-[1180px] flex-col min-[521px]:min-h-[calc(100vh-44px)] min-[821px]:min-h-[calc(100vh-64px)]"
        aria-labelledby="page-title"
      >
        <header className="border-line flex items-start justify-between gap-6 border-b pt-2.5 pb-[30px] min-[521px]:items-center">
          <Link
            className="text-ink inline-flex items-center gap-3 text-[0.9rem] font-[750] tracking-[0.08em] uppercase no-underline"
            href="/"
            aria-label="Kyron launcher home"
          >
            <span
              className="bg-ink text-lime grid h-9 w-9 place-items-center rounded-[11px] text-base tracking-normal"
              aria-hidden="true"
            >
              K
            </span>
            <span>Stevens CPE</span>
          </Link>

          <Badge
            className="border-line text-muted-foreground h-auto gap-2 bg-white/55 px-[13px] py-[9px] text-[0.78rem] font-bold tracking-[0.04em] max-[520px]:max-w-[126px] max-[520px]:items-start max-[520px]:border-0 max-[520px]:bg-transparent max-[520px]:px-0"
            variant="outline"
          >
            <span
              className="bg-teal mt-[5px] h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(8,127,116,0.12)] min-[521px]:mt-0"
              aria-hidden="true"
            />
            Preview environment
          </Badge>
        </header>

        <div className="grid flex-1 grid-cols-1 items-center gap-[52px] py-[70px] min-[821px]:grid-cols-[minmax(0,1.3fr)_minmax(310px,0.7fr)] min-[821px]:gap-[clamp(54px,8vw,118px)] min-[821px]:py-[clamp(64px,10vw,126px)]">
          <div>
            <p className="text-teal-dark mb-[22px] text-[0.78rem] font-extrabold tracking-[0.18em] uppercase">
              Course creation, streamlined
            </p>
            <h1
              className="max-w-[760px] font-serif text-[clamp(3rem,16vw,4.6rem)] leading-[0.92] font-medium tracking-[-0.062em] min-[521px]:text-[clamp(3.2rem,7vw,6.7rem)]"
              id="page-title"
            >
              Launch a thoughtful first draft in Kyron.
            </h1>
            <p className="text-muted-foreground mt-8 max-w-[650px] text-[clamp(1.05rem,1.5vw,1.24rem)] leading-[1.72]">
              A focused workspace for the Stevens CPE team to prepare course
              details, add source material, and start an editable Kyron draft.
            </p>

            <div
              className="mt-[38px] flex flex-wrap items-center gap-3.5"
              aria-label="Project status"
            >
              <Button
                className="bg-ink min-h-12 rounded-[13px] px-[19px] text-[0.88rem] font-[750] text-white opacity-90"
                disabled
                size="lg"
              >
                Launcher coming next
              </Button>
              <Button
                className="text-ink min-h-12 rounded-[13px] px-[19px] text-[0.88rem] font-[750] decoration-ink/35 underline-offset-[5px]"
                nativeButton={false}
                render={<a href="#deployment-status" />}
                size="lg"
                variant="link"
              >
                View deployment status
              </Button>
            </div>
          </div>

          <aside aria-label="Planned workflow">
            <Card className="shadow-panel max-w-[530px] gap-0 overflow-hidden rounded-[28px] border border-white/80 bg-white/78 py-0 ring-0 backdrop-blur-[18px] min-[821px]:max-w-none">
              <CardHeader className="border-line mx-[25px] flex flex-row items-center justify-between border-b px-0 py-[25px] pb-[21px]">
                <CardTitle className="text-[0.87rem] font-extrabold">
                  Draft workflow
                </CardTitle>
                <Badge className="bg-lime text-ink h-auto px-[9px] py-1.5 text-[0.65rem] font-bold tracking-[0.12em]">
                  MVP
                </Badge>
              </CardHeader>

              <CardContent className="px-[25px]">
                <ol className="my-1.5 grid list-none p-0">
                  {projectSteps.map((step, index) => (
                    <li
                      className="border-line text-ink flex items-center gap-[15px] border-b py-5 text-[0.94rem] font-[650]"
                      key={step}
                    >
                      <span className="border-line text-teal-dark grid h-[33px] w-[33px] shrink-0 place-items-center rounded-full border text-xs tabular-nums">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>

              <CardFooter className="text-muted-foreground mx-[25px] gap-[11px] border-0 bg-transparent px-0 pt-[13px] pb-[25px] text-[0.76rem] leading-normal">
                <span
                  className="bg-teal/10 text-teal grid h-[23px] w-[23px] shrink-0 place-items-center rounded-[7px] font-black"
                  aria-hidden="true"
                >
                  ✓
                </span>
                Human review remains in Kyron Studio
              </CardFooter>
            </Card>
          </aside>
        </div>

        <footer
          className="border-line flex flex-col items-start justify-between gap-5 border-t pt-[25px] pb-[3px] min-[521px]:flex-row min-[521px]:items-center"
          id="deployment-status"
        >
          <div className="grid gap-[5px]">
            <span className="text-muted-foreground text-[0.68rem] font-bold tracking-[0.13em] uppercase">
              Deployment status
            </span>
            <strong className="text-[0.92rem]">
              Next.js project shell is ready
            </strong>
          </div>
          <Badge
            className="border-line text-teal-dark h-auto gap-2 bg-white/55 px-[13px] py-[9px] text-[0.78rem] font-bold tracking-[0.04em]"
            variant="outline"
          >
            Vercel preview
          </Badge>
        </footer>
      </section>
    </main>
  );
}

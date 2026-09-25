import type { Answer } from "@/lib/seo/editorial-content";

export function AnswerSection({ title = "Questions, answered", answers }: { title?: string; answers: Answer[] }) {
  return <section aria-label={title}><h2 className="editorial text-3xl tracking-tight">{title}</h2><div className="mt-7 grid gap-x-10 gap-y-8 md:grid-cols-2">{answers.map(({ question, answer }) => <div key={question}><h3 className="text-base font-semibold leading-6">{question}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{answer}</p></div>)}</div></section>;
}

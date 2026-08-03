import { Card, CardBody, CardHeader } from "@/components/ui/card";

export function PagePlaceholder({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <ul className="space-y-2 text-sm text-muted">
          {bullets.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

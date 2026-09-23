import type { PublicWinner } from "../draw_schemas";

export function EventWinnerList({
  title,
  items,
}: {
  title: string;
  items: PublicWinner[];
}) {
  return (
    <section
      className="cms-block event-winners-block"
      aria-label="Published demonstration winners"
    >
      <p className="eyebrow">Demonstration only · No real prize awards</p>
      {title && <h2>{title}</h2>}
      <ul className="event-winner-list">
        {items.map((item, index) => (
          <li key={index}>
            <strong>{item.prizeTitle}</strong>
            <span>{item.displayName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

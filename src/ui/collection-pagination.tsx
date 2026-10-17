"use client";

export function CollectionPagination({
  page,
  pageSize,
  total,
  onPage,
  noun = "results",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="collection-pagination" aria-label="Result pages">
      <span role="status">
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
          : "0"}{" "}
        {noun}
      </span>
      <div className="admin-actions">
        <button
          type="button"
          className="button button-outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous page
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          type="button"
          className="button button-outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next page
        </button>
      </div>
    </nav>
  );
}

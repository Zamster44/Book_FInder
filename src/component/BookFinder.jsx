import React, { useEffect, useState, useRef } from "react";
import "./BookFinder.css";

/**
 * Simplified BookFinder:
 * - Only title input (user query)
 * - No other input fields
 * - No cover images (removed)
 * - Debounced search, pagination, details modal
 * - Reading list preserved (no thumbnails)
 */

export default function BookFinder() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [numFound, setNumFound] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const [readingList, setReadingList] = useState(() => {
    try {
      const raw = localStorage.getItem("readingList");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("readingList", JSON.stringify(readingList));
  }, [readingList]);

  // Reset to first page when query changes
  useEffect(() => {
    setPage(1);
  }, [query]);

  // Debounced fetch on query or page change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setNumFound(0);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchBooks({ query, page });
    }, 450);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page]);

  async function fetchBooks({ query, page = 1 }) {
    if (!query?.trim()) return;

    const base = "https://openlibrary.org/search.json";
    const params = new URLSearchParams();
    params.set("title", query.trim());
    params.set("page", String(page));
    params.set("limit", "20");

    const url = `${base}?${params.toString()}`;

    // Abort previous
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`OpenLibrary error ${res.status}`);
      const data = await res.json();

      const docs = data.docs || [];
      setResults(docs);
      setNumFound(data.numFound || 0);
      setLoading(false);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to fetch");
      setLoading(false);
    }
  }

  function keyForDoc(doc) {
    return doc.key || `${doc.title}-${(doc.author_name || []).join(",")}`;
  }

  function toggleReadingList(doc) {
    setReadingList((prev) => {
      const key = keyForDoc(doc);
      const copy = { ...prev };
      if (copy[key]) {
        delete copy[key];
      } else {
        copy[key] = {
          title: doc.title,
          authors: doc.author_name || [],
          key,
        };
      }
      return copy;
    });
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    setNumFound(0);
    setError(null);
  }

  function onExportReadingList() {
    const blob = new Blob([JSON.stringify(readingList, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reading_list.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImportReadingList(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        setReadingList((prev) => ({ ...prev, ...parsed }));
      } catch {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }

  const totalPages = Math.max(1, Math.ceil(numFound / 20));

  return (
    <div className="app-bg">
      <div className="container">
        <header className="header">
          <div className="header-left">
            <h1>📚 BookFinder</h1>
            <p className="sub">Type a book title and press Enter or wait — results will appear below.</p>
          </div>

        </header>

        {/* Only Title Input */}
        <div className="search-panel simple">
          <label className="label">Title</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input full"
              placeholder="Enter book title (e.g., To Kill a Mockingbird)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setPage(1);
              }}
              aria-label="Search by title"
            />
            <button className="btn btn-ghost" onClick={() => setPage(1)}>Search</button>
            <button className="btn btn-danger" onClick={clearSearch}>Clear</button>
          </div>
        </div>

        {/* Results header */}
        <div className="results-header">
          <div>
            <p className="text-muted">{loading ? "Searching…" : `${numFound.toLocaleString()} results${numFound ? ` — page ${page} of ${totalPages}` : ""}`}</p>
          </div>
        </div>

        {/* Results list (no covers) */}
        <section>
          {error && <div className="error">Error: {error}</div>}

          {!loading && results.length === 0 && query && (
            <div className="no-results">No results found. Try a different title.</div>
          )}

          <div className="list">
            {results.map((doc) => {
              const k = keyForDoc(doc);
              return (
                <div key={k} className="list-item">
                  <div className="meta">
                    <div className="title">{doc.title}</div>
                    <div className="authors">{(doc.author_name || []).join(", ")}</div>
                    <div className="year">{doc.first_publish_year ? `First published: ${doc.first_publish_year}` : ""}</div>
                  </div>

                  <div className="actions">
                    <button className="small-btn alt" onClick={() => setSelected(doc)}>Details</button>
                    <button
                      className="small-btn save"
                      onClick={() => toggleReadingList(doc)}
                      aria-pressed={!!readingList[keyForDoc(doc)]}
                    >
                      {readingList[keyForDoc(doc)] ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {results.length > 0 && (
            <div className="pagination">
              <div className="text-muted">Showing {results.length} of {numFound.toLocaleString()}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </button>
                <div className="text-muted">Page {page} / {totalPages}</div>
                <button
                  className="btn btn-ghost"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Reading list (no thumbnails) */}
        <aside className="reading-list">
          <h2>My Reading List</h2>
          {Object.keys(readingList).length === 0 ? (
            <p className="text-muted">Your saved books will appear here. Click Save on any result.</p>
          ) : (
            <div>
              {Object.entries(readingList).map(([k, item]) => (
                <div key={k} className="reading-item no-thumb">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{(item.authors || []).join(", ")}</div>
                  </div>
                  <div>
                    <button
                      className="small-btn alt"
                      onClick={() => {
                        setReadingList((prev) => {
                          const copy = { ...prev };
                          delete copy[k];
                          return copy;
                        });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Details modal (no cover) */}
        {selected && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card small" role="document">
              <div className="modal-body">
                <h3>{selected.title}</h3>
                <p className="text-muted">{(selected.author_name || []).join(", ")}</p>
                <p className="mb-2">First published: <strong>{selected.first_publish_year || "—"}</strong></p>
                <p className="text-muted">Edition count: {selected.edition_count || "—"}</p>
                {selected.subject && <p className="text-muted">Subjects: {(selected.subject || []).slice(0, 8).join(", ")}</p>}
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <a href={`https://openlibrary.org${selected.key}`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: "none" }}>
                    Open on OpenLibrary
                  </a>
                  <button
                    className="btn btn-ghost"
                    onClick={() => { toggleReadingList(selected); }}
                  >
                    {readingList[keyForDoc(selected)] ? "Saved" : "Save"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setSelected(null)} style={{ marginLeft: "auto" }}>
                    Close
                  </button>
                </div>
              </div>
            </div>
            <div
              onClick={() => setSelected(null)}
              style={{ position: "fixed", inset: 0 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

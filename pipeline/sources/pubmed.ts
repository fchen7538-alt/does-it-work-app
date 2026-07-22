// PubMed E-utilities client (NCBI).
//
// Docs: https://www.ncbi.nlm.nih.gov/books/NBK25501/
// Base URL: https://eutils.ncbi.nlm.nih.gov/entrez/eutils
//
// Two things this pipeline needs per ingredient:
//   1. A raw study count (esearch, retmode=json, count only) — surfaced
//      directly in the UI as "X studies found."
//   2. Whether a Cochrane review or another peer-reviewed systematic
//      review/meta-analysis with a *stated conclusion* exists — surfaced as
//      "what reviewers concluded," attributed to its named source.
//
// For (2), esearch + esummary can find and cite a candidate review
// (PMID, title, journal, year — a real "named source"), but turning that
// abstract into a faithful plain-language conclusion is an editorial step,
// not something to auto-generate from a JSON field. So `findReviewCandidate`
// returns the citation + abstract text for a human editor (or a separate,
// explicitly-reviewed summarization pass) to turn into a `ReviewVerdict`.
// It deliberately does NOT fabricate `ReviewVerdict.text` itself — that
// would violate the "only show a verdict when one exists" requirement.

import { createRateLimiter, fetchJson } from "../lib/http";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const apiKey = process.env.NCBI_API_KEY;
// Without a key: 3 req/sec max. With a key: 10 req/sec.
const throttle = createRateLimiter(apiKey ? 110 : 350);

interface ESearchResponse {
  esearchresult?: { count?: string; idlist?: string[] };
}

interface ESummaryResponse {
  result?: {
    uids?: string[];
    [pmid: string]: unknown;
  };
}

function withKey(params: URLSearchParams): URLSearchParams {
  if (apiKey) params.set("api_key", apiKey);
  return params;
}

export async function getStudyCount(term: string): Promise<number> {
  await throttle();
  const params = withKey(
    new URLSearchParams({ db: "pubmed", term, retmode: "json", rettype: "count" }),
  );
  const data = await fetchJson<ESearchResponse>(`${EUTILS_BASE}/esearch.fcgi?${params}`);
  return Number(data.esearchresult?.count ?? 0);
}

export interface ReviewCandidate {
  pmid: string;
  title: string;
  journal: string;
  year: string;
  isCochrane: boolean;
}

/**
 * Searches for the most recent systematic review / meta-analysis /
 * Cochrane review on a topic and returns a citable candidate, or null if
 * none exists. Does not attempt to synthesize a conclusion.
 */
export async function findReviewCandidate(topic: string): Promise<ReviewCandidate | null> {
  await throttle();
  const searchTerm = `${topic} AND (systematic review[pt] OR meta-analysis[pt] OR "cochrane database syst rev"[ta])`;
  const searchParams = withKey(
    new URLSearchParams({
      db: "pubmed",
      term: searchTerm,
      retmode: "json",
      sort: "pub_date",
      retmax: "1",
    }),
  );
  const searchData = await fetchJson<ESearchResponse>(`${EUTILS_BASE}/esearch.fcgi?${searchParams}`);
  const pmid = searchData.esearchresult?.idlist?.[0];
  if (!pmid) return null;

  await throttle();
  const summaryParams = withKey(new URLSearchParams({ db: "pubmed", id: pmid, retmode: "json" }));
  const summaryData = await fetchJson<ESummaryResponse>(`${EUTILS_BASE}/esummary.fcgi?${summaryParams}`);
  const doc = summaryData.result?.[pmid] as
    | { title?: string; fulljournalname?: string; pubdate?: string }
    | undefined;
  if (!doc) return null;

  return {
    pmid,
    title: doc.title ?? "",
    journal: doc.fulljournalname ?? "",
    year: (doc.pubdate ?? "").slice(0, 4),
    isCochrane: /cochrane/i.test(doc.fulljournalname ?? ""),
  };
}

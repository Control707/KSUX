export interface SyllabusSummaryPayload {
  instructor?: string;
  officeHours?: string;
  gradingWeights: Array<{ label: string; weight: string }>;
  textbooks: string[];
  policies?: string;
}

export interface SimpleSyllabusLookupResult {
  status: "found" | "not_found" | "upstream_unreachable";
  matchedSectionLabel: string;
  matchedCrn?: string;
  sourceUrl: string;
  summary?: SyllabusSummaryPayload;
}

export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

const MAX_SUMMARY_BYTES = 8_000;

export async function fetchSimpleSyllabusSummary(
  params: {
    subjectCourse: string;
    termCode: string;
    crn?: string;
  },
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<SimpleSyllabusLookupResult> {
  const searchQuery = encodeURIComponent(
    params.crn
      ? `${params.subjectCourse} ${params.crn}`
      : params.subjectCourse
  );
  const searchUrl = `https://kennesaw.simplesyllabus.com/api2/doc-library-search?search=${searchQuery}&page=1&page_size=10`;
  const fallbackLibraryUrl = `https://kennesaw.simplesyllabus.com/en-US/doc-library?search=${encodeURIComponent(params.subjectCourse)}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetchImpl(searchUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        throw new Error(`Simple Syllabus HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const items: any[] = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.results)
          ? data.results
          : [];

      if (items.length === 0) {
        return {
          status: "not_found",
          matchedSectionLabel: "No published Simple Syllabus found",
          sourceUrl: fallbackLibraryUrl,
        };
      }

      const exactMatch = params.crn
        ? items.find((it) =>
            JSON.stringify(it).includes(String(params.crn))
          )
        : null;
      const chosen = exactMatch ?? items[0]!;
      const sectionLabel = exactMatch
        ? `Section ${chosen.section ?? ""} (CRN ${params.crn})`.trim()
        : `Showing syllabus from Section ${chosen.section ?? "01"}`;

      const summary: SyllabusSummaryPayload = {
        instructor: chosen.instructor_name || chosen.editor_name || "KSU Faculty",
        officeHours:
          chosen.office_hours || "Posted in D2L Brightspace & Simple Syllabus",
        gradingWeights: Array.isArray(chosen.grading_weights)
          ? chosen.grading_weights.slice(0, 6)
          : [{ label: "See official Simple Syllabus breakdown", weight: "100%" }],
        textbooks: Array.isArray(chosen.textbooks)
          ? chosen.textbooks.slice(0, 4)
          : [],
        policies: String(
          chosen.policies ||
            "Standard KSU attendance and SCAI academic integrity rules apply."
        ).slice(0, 600),
      };

      const encoded = JSON.stringify(summary);
      const boundedSummary =
        encoded.length <= MAX_SUMMARY_BYTES
          ? summary
          : {
              ...summary,
              policies: summary.policies?.slice(0, 200),
            };

      return {
        status: "found",
        matchedSectionLabel: sectionLabel,
        matchedCrn: exactMatch ? params.crn : chosen.crn,
        sourceUrl: chosen.url || fallbackLibraryUrl,
        summary: boundedSummary,
      };
    } catch (err) {
      lastErr = err;
    }
  }

  void lastErr;
  return {
    status: "upstream_unreachable",
    matchedSectionLabel: "Simple Syllabus temporarily unreachable",
    sourceUrl: fallbackLibraryUrl,
  };
}

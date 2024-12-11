import { fetchPagesAndWriteTree, TPageName } from "@powerhousedao/mips-parser";
async function main() {
  const shouldRefreshData = process.env.SHOULD_REFRESH_DATA === "true";
  if (!shouldRefreshData) return;

  const apiKey = process.env.API_KEY;
  const outputPath = "data";
  const shouldUseExistingData = process.env.SHOULD_USE_EXISTING_DATA === "true";
  const shouldRefetchPages = !shouldUseExistingData;
  const shouldFetchWithoutFilter = process.env.SHOULD_FETCH_WITHOUT_FILTER === "true";
  const shouldFilterByStatus = !shouldFetchWithoutFilter;
  const fetchOnePage = undefined;
  const overridePageIds = JSON.parse(process.env.OVERRIDE_PAGE_IDS || "[]") as {
    pageName: TPageName;
    pageId: string;
  }[];

  await fetchPagesAndWriteTree({
    outputPath,
    apiKey,
    shouldRefetchPages,
    shouldFilterByStatus,
    fetchOnePage,
    overridePageIds,
  });
}

main();

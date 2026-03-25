/** AI category / department labels (must match backend classification). */
export const DEPARTMENT_CATEGORIES = ["Sales", "HR", "Accounts", "Tech", "General", "Spam"] as const;
export type DepartmentCategory = (typeof DEPARTMENT_CATEGORIES)[number];

/** URL segment under /departments/:slug → API category filter (empty = all). */
export const DEPARTMENT_SLUG_TO_CATEGORY: Record<string, "" | DepartmentCategory> = {
  all: "",
  sales: "Sales",
  hr: "HR",
  accounts: "Accounts",
  tech: "Tech",
  general: "General",
  spam: "Spam",
};

export function slugToCategoryFilter(slug: string): string | undefined {
  const key = slug.trim().toLowerCase();
  if (!(key in DEPARTMENT_SLUG_TO_CATEGORY)) return undefined;
  return DEPARTMENT_SLUG_TO_CATEGORY[key];
}

export function categoryToDepartmentSlug(category: string): string {
  return category.toLowerCase();
}

/** Validate ?category= from /emails URL. */
export function normalizeCategoryQueryParam(raw: string | null): string {
  if (!raw) return "";
  return DEPARTMENT_CATEGORIES.includes(raw as DepartmentCategory) ? raw : "";
}

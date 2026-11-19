import { ChevronDown, ListFilter, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { localizedDifficultyOptions, localizedQuestionTypeOptions } from "@/lib/question-labels";
import { CustomSelect } from "../custom-select";
import type { PracticeCatalog, PracticeFilters as Filters } from "./practice-api";

export function tagFilterEntries(value: string) {
  return value.split(",").filter(Boolean).map((entry) => {
    const separator = entry.indexOf(":");
    return separator === -1
      ? { dimension: "TOPIC", slug: entry }
      : { dimension: entry.slice(0, separator), slug: entry.slice(separator + 1) };
  });
}

export function selectedTagFilter(value: string, dimension: string) {
  return tagFilterEntries(value).find((entry) => entry.dimension === dimension)?.slug ?? "";
}

export function replaceTagFilter(value: string, dimension: string, slug: string) {
  const retained = tagFilterEntries(value).filter((entry) => entry.dimension !== dimension);
  if (slug) retained.push({ dimension, slug });
  return retained.map((entry) => `${entry.dimension}:${entry.slug}`).join(",");
}

export function activeFilterCounts(filters: Filters) {
  const tagCount = tagFilterEntries(filters.tags).length;
  return {
    total: [filters.gradeBand, filters.grade, filters.subject, filters.difficulty, filters.type].filter(Boolean).length + tagCount,
    advanced: [filters.difficulty, filters.type].filter(Boolean).length + tagCount,
  };
}

export function PracticeFilters({ filters, catalog, catalogLoading, catalogError, disabled, onChange, onReset }: {
  filters: Filters;
  catalog: PracticeCatalog;
  catalogLoading: boolean;
  catalogError: string;
  disabled: boolean;
  onChange: (key: keyof Filters, value: string) => void;
  onReset: () => void;
}) {
  const t = useT();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const difficultyOptions = [{ value: "", label: t("practice.filters.allDifficulties") }, ...localizedDifficultyOptions(t)];
  const typeOptions = [{ value: "", label: t("practice.filters.allTypes") }, ...localizedQuestionTypeOptions(t)];
  const counts = activeFilterCounts(filters);
  const catalogDisabled = disabled || catalogLoading;

  return (
    <section aria-labelledby="practice-filter-heading" className="mt-6 rounded-2xl border-2 border-ink/10 bg-white/70 p-3 shadow-[0_3px_0_rgba(36,33,54,.06)] sm:p-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#efecff] text-violet"><ListFilter size={17} strokeWidth={2.5} /></span>
          <div className="min-w-0">
            <h2 id="practice-filter-heading" className="text-sm font-black">{t("practice.filters.title")}</h2>
            <p className="truncate text-[11px] font-bold text-muted">{counts.total ? t("practice.filters.activeCount", { count: counts.total }) : t("practice.filters.noneActive")}</p>
          </div>
        </div>
        {counts.total ? <button type="button" onClick={() => { setAdvancedOpen(false); onReset(); }} disabled={disabled} className="shrink-0 rounded-lg px-2 py-2 text-xs font-black text-muted transition hover:bg-white hover:text-violet disabled:opacity-40"><RotateCcw className="mr-1 inline" size={13} />{t("practice.filters.reset")}</button> : null}
      </div>

      <div role="group" aria-label={t("practice.filters.basic")} className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
        <CustomSelect
          label={t("practice.filters.chooseBand")}
          value={filters.gradeBand}
          options={[{ value: "", label: t("practice.filters.allBands") }, ...catalog.gradeBands.map((item) => ({ value: item.slug, label: item.name }))]}
          onValueChange={(value) => onChange("gradeBand", value)}
          disabled={catalogDisabled}
          className="w-full"
        />
        {filters.gradeBand ? <CustomSelect
          label={t("practice.filters.chooseGrade")}
          value={filters.grade}
          options={[{ value: "", label: t("practice.filters.allGrades") }, ...catalog.grades.map((item) => ({ value: item.slug, label: item.name }))]}
          onValueChange={(value) => onChange("grade", value)}
          disabled={catalogDisabled}
          className="w-full"
        /> : null}
        <CustomSelect
          label={t("practice.filters.chooseSubject")}
          value={filters.subject}
          options={[{ value: "", label: t("practice.filters.allSubjects") }, ...catalog.subjects.map((item) => ({ value: item.slug, label: item.name }))]}
          onValueChange={(value) => onChange("subject", value)}
          disabled={catalogDisabled}
          className={`w-full ${filters.gradeBand ? "col-span-2 sm:col-span-1" : ""}`}
        />
      </div>

      <button
        type="button"
        aria-expanded={advancedOpen}
        aria-controls="advanced-practice-filters"
        onClick={() => setAdvancedOpen((open) => !open)}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-black text-muted transition hover:bg-white hover:text-violet lg:hidden"
      >
        {advancedOpen ? t("practice.filters.less") : t("practice.filters.more")}
        {counts.advanced ? <span className="grid min-w-5 place-items-center rounded-full bg-violet px-1.5 py-0.5 text-[10px] text-white">{counts.advanced}</span> : null}
        <ChevronDown className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`} size={15} />
      </button>

      <div id="advanced-practice-filters" role="group" aria-label={t("practice.filters.more")} className={`${advancedOpen ? "grid" : "hidden"} mt-2 min-w-0 grid-cols-2 gap-2 border-t border-dashed border-ink/10 pt-3 sm:grid-cols-3 lg:grid lg:grid-cols-5`}>
        {catalog.tagDimensions.map((dimension) => <CustomSelect
          key={dimension.key}
          label={t("practice.filters.chooseDimension", { label: dimension.label })}
          value={selectedTagFilter(filters.tags, dimension.key)}
          options={[{ value: "", label: t("practice.filters.allOfDimension", { label: dimension.label }) }, ...dimension.tags.map((tag) => ({ value: tag.slug, label: tag.label }))]}
          onValueChange={(value) => onChange("tags", replaceTagFilter(filters.tags, dimension.key, value))}
          disabled={catalogDisabled || !dimension.tags.length}
          className="w-full"
        />)}
        <CustomSelect label={t("practice.filters.chooseDifficulty")} value={filters.difficulty} options={difficultyOptions} onValueChange={(value) => onChange("difficulty", value)} disabled={disabled} className="w-full" />
        <CustomSelect label={t("practice.filters.chooseType")} value={filters.type} options={typeOptions} onValueChange={(value) => onChange("type", value)} disabled={disabled} className="w-full" />
      </div>
      {catalogError ? <p role="alert" className="mt-2 text-xs font-bold text-coral">{catalogError}</p> : null}
    </section>
  );
}

import { useMemo } from "react";

import { useTracingStore } from "../stores/tracingStore";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalDateTimeInputValue(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toOptionalIsoFromLocalDateTimeInputValue(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export function FilterBar(): React.ReactElement {
  const { filters, setFilters, resetFilters } = useTracingStore();

  const fromValue = useMemo(() => toLocalDateTimeInputValue(filters.from), [filters.from]);
  const toValue = useMemo(() => toLocalDateTimeInputValue(filters.to), [filters.to]);

  const hasErrorValue = filters.has_error === undefined ? "" : String(filters.has_error);
  const minDurationValue = filters.min_duration_ms === undefined ? "" : String(filters.min_duration_ms);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] text-gray-500">from</div>
        <input
          type="datetime-local"
          value={fromValue}
          onChange={(e) => setFilters({ from: toOptionalIsoFromLocalDateTimeInputValue(e.target.value) })}
          className="h-9 px-2 text-sm border border-gray-200 rounded bg-white"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[11px] text-gray-500">to</div>
        <input
          type="datetime-local"
          value={toValue}
          onChange={(e) => setFilters({ to: toOptionalIsoFromLocalDateTimeInputValue(e.target.value) })}
          className="h-9 px-2 text-sm border border-gray-200 rounded bg-white"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[11px] text-gray-500">has_error</div>
        <select
          value={hasErrorValue}
          onChange={(e) => {
            const v = e.target.value;
            setFilters({ has_error: v === "" ? undefined : (Number(v) as 0 | 1) });
          }}
          className="h-9 px-2 text-sm border border-gray-200 rounded bg-white"
        >
          <option value="">全部</option>
          <option value="1">仅错误</option>
          <option value="0">仅无错误</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[11px] text-gray-500">min_duration_ms</div>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={minDurationValue}
          onChange={(e) => {
            const v = e.target.value.trim();
            setFilters({ min_duration_ms: v === "" ? undefined : Number(v) });
          }}
          className="h-9 px-2 text-sm border border-gray-200 rounded bg-white w-36"
          placeholder="0"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[11px] text-gray-500">model</div>
        <input
          type="text"
          value={filters.model ?? ""}
          onChange={(e) => setFilters({ model: e.target.value })}
          className="h-9 px-2 text-sm border border-gray-200 rounded bg-white w-40"
          placeholder="例如 gpt-4.1"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[11px] text-gray-500">tool_name</div>
        <input
          type="text"
          value={filters.tool_name ?? ""}
          onChange={(e) => setFilters({ tool_name: e.target.value })}
          className="h-9 px-2 text-sm border border-gray-200 rounded bg-white w-48"
          placeholder="例如 web_search"
        />
      </div>

      <button
        type="button"
        className="h-9 px-3 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50"
        onClick={() => resetFilters()}
      >
        清空
      </button>
    </div>
  );
}


"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

type Variable = {
  table: string;
  tableLabel: string;
  column: string;
  columnLabel: string;
  numeric: boolean;
};

type VariableSelectorProps = {
  variables: Variable[];
};

export function VariableSelector({ variables }: VariableSelectorProps) {
  const [selectedVariables, setSelectedVariables] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  // Group variables by table
  const variablesByTable = variables.reduce((acc, variable) => {
    const key = variable.table;
    if (!acc[key]) {
      acc[key] = {
        tableLabel: variable.tableLabel,
        variables: [],
      };
    }
    acc[key].variables.push(variable);
    return acc;
  }, {} as Record<string, { tableLabel: string; variables: Variable[] }>);

  const toggleVariable = (table: string, column: string) => {
    const key = `${table}.${column}`;
    const newSelected = new Set(selectedVariables);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedVariables(newSelected);
    
    // Store in localStorage for the chat component to access
    localStorage.setItem("selectedVariables", JSON.stringify(Array.from(newSelected)));
  };

  const clearAll = () => {
    setSelectedVariables(new Set());
    localStorage.removeItem("selectedVariables");
  };

  const filteredTables = Object.entries(variablesByTable).map(([table, data]) => ({
    table,
    tableLabel: data.tableLabel,
    variables: data.variables.filter(
      (v) =>
        v.columnLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.column.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  })).filter((t) => t.variables.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Search variables..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 rounded-2xl border border-white/10 bg-[#0a0a0a] px-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none"
        />
        {selectedVariables.size > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0a0a0a] px-4 py-2 text-xs text-slate-300 transition hover:border-red-400/60 hover:text-red-200"
          >
            <X className="h-3 w-3" />
            Clear All ({selectedVariables.size})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {filteredTables.map(({ table, tableLabel, variables: tableVars }) => (
          <div key={table} className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-300">{tableLabel}</h3>
            <div className="flex flex-col gap-1">
              {tableVars.map((variable) => {
                const key = `${variable.table}.${variable.column}`;
                const isSelected = selectedVariables.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleVariable(variable.table, variable.column)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition ${
                      isSelected
                        ? "bg-sky-500/20 text-sky-200 border border-sky-400/40"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-300 border border-transparent"
                    }`}
                  >
                    <span className="flex-1">
                      {variable.columnLabel}
                      {variable.numeric && (
                        <span className="ml-1 text-[0.65rem] text-slate-500">(numeric)</span>
                      )}
                    </span>
                    {isSelected && <Check className="h-3 w-3 text-sky-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedVariables.size > 0 && (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
          <p className="text-xs text-sky-200">
            <span className="font-semibold">{selectedVariables.size} variable{selectedVariables.size !== 1 ? "s" : ""} selected.</span>{" "}
            Ask the AI assistant below to analyze these variables, create charts, or generate insights.
          </p>
        </div>
      )}
    </div>
  );
}

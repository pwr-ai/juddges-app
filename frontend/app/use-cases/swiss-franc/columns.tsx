import { ColumnDef } from "@tanstack/react-table";
import { JudgmentData } from "./types";

export const columns: ColumnDef<JudgmentData>[] = [
  {
    accessorKey: "data_wyroku",
    header: "Judgment Date",
  },
  {
    accessorKey: "apelacja",
    header: "Appeal Court",
  },
  {
    accessorKey: "typ_sadu",
    header: "Court Type",
  },
  {
    accessorKey: "instancja_sadu",
    header: "Court Instance",
  },
  {
    accessorKey: "podstawa_prawna",
    header: "Legal Basis",
  },
  {
    accessorKey: "podstawa_prawna_podana",
    header: "Legal Basis Provided",
    cell: ({ row }) => (
      <div className="flex justify-center">
        <input type="checkbox" checked={row.getValue("podstawa_prawna_podana")} readOnly />
      </div>
    ),
  },
  {
    accessorKey: "rodzaj_roszczenia",
    header: "Claim Type",
  },
  {
    accessorKey: "modyfikacje",
    header: "Modifications",
    cell: ({ row }) => (
      <div className="flex justify-center">
        <input type="checkbox" checked={row.getValue("modyfikacje")} readOnly />
      </div>
    ),
  },
  {
    accessorKey: "wynik_sprawy",
    header: "Case Outcome",
    cell: ({ row }) => {
      const wynik = row.getValue("wynik_sprawy") as string;
      return (
        <div className="text-sm">
          {wynik}
        </div>
      );
    },
  },
]; 
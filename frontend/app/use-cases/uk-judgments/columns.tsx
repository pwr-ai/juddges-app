import { ColumnDef } from "@tanstack/react-table";
import { UKJudgmentData } from "./page";

export const columns: ColumnDef<UKJudgmentData>[] = [
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => {
      const date = new Date(row.getValue("date"));
      return <div>{date.toLocaleDateString()}</div>;
    },
  },
  {
    accessorKey: "court",
    header: "Court",
  },
  {
    accessorKey: "caseNumber",
    header: "Case Number",
  },
  {
    accessorKey: "jurisdiction",
    header: "Jurisdiction",
  },
  {
    accessorKey: "subjectMatter",
    header: "Subject Matter",
  },
  {
    accessorKey: "judgmentType",
    header: "Judgment Type",
    cell: ({ row }) => {
      const type = row.getValue("judgmentType") as string;
      return (
        <div
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            type === "Final"
              ? "bg-green-100 text-green-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
          {type}
        </div>
      );
    },
  },
]; 
import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "./data-table.jsx";

const columns = [
  { accessorKey: "nome", header: "Nome" },
  {
    accessorKey: "prezzo",
    header: "Prezzo",
    cell: (info) => <span className="data-table-num">{info.getValue()}</span>,
  },
  {
    id: "stato",
    header: "Stato",
    cell: ({ row }) =>
      row.original.infortunato ? <i className="player-status-badge">Infortunato</i> : null,
  },
];

const data = [
  { id: 1, nome: "Bianchi", prezzo: 30, infortunato: false },
  { id: 2, nome: "Adami", prezzo: 10, infortunato: true },
  { id: 3, nome: "Colombo", prezzo: 20, infortunato: false },
];

describe("DataTable", () => {
  test("sorts rows when a sortable column header is clicked", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} getRowId={(row) => row.id} />);
    const rowsBefore = screen.getAllByRole("row").slice(1);
    expect(within(rowsBefore[0]).getByText("Bianchi")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Nome/ }));
    const rowsAscending = screen.getAllByRole("row").slice(1);
    expect(within(rowsAscending[0]).getByText("Adami")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Nome/ }));
    const rowsDescending = screen.getAllByRole("row").slice(1);
    expect(within(rowsDescending[0]).getByText("Colombo")).toBeInTheDocument();
  });

  test("filters rows via the free-text filter box", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        filterPlaceholder="Cerca..."
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(data.length + 1);

    await user.type(screen.getByPlaceholderText("Cerca..."), "bian");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Bianchi")).toBeInTheDocument();
    expect(screen.queryByText("Adami")).not.toBeInTheDocument();
  });

  test("status badges stay visible after sorting and filtering", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} getRowId={(row) => row.id} />);
    expect(screen.getByText("Infortunato")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Prezzo/ }));
    expect(screen.getByText("Infortunato")).toBeInTheDocument();
  });
});

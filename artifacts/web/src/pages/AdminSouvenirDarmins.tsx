import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";

type RecordRow = {
  serialNumber: number;
  citizenId: number | null;
  citizenName: string | null;
  slogan: string;
  status: string;
  nftTokenId: string | null;
  nftTransactionHash: string | null;
  createdAt: string;
};

export function AdminSouvenirDarmins() {
  const { citizen, authToken } = useCitizen();
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authToken || !citizen?.isAdmin) return;
    void fetch("/api/admin/souvenir-darmins", { headers: { Authorization: `Bearer ${authToken}` } })
      .then(async (response) => {
        const data = await response.json() as RecordRow[] | { error?: string };
        if (!response.ok || !Array.isArray(data)) throw new Error((data as { error?: string }).error ?? "Не удалось загрузить реестр.");
        setRows(data);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [authToken, citizen?.isAdmin]);

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-bold">Реестр сувенирных Дарминов</h1>
          <p className="mt-1 text-sm text-muted-foreground">Сквозная нумерация выпусков, владелец, статус NFT.</p>
        </div>
        {!citizen?.isAdmin && <p className="text-destructive">Доступ только для администратора.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr>{["Номер", "Гражданин", "Слоган", "Выпущен", "Статус", "NFT"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.serialNumber} className="border-t border-border">
                  <td className="p-3 font-mono text-primary">DM {String(row.serialNumber).padStart(9, "0")}</td>
                  <td className="p-3">{row.citizenName ?? (row.serialNumber === 1 ? "Генезис" : `ID ${row.citizenId ?? "—"}`)}</td>
                  <td className="max-w-[260px] truncate p-3">{row.slogan}</td>
                  <td className="p-3">{new Date(row.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="p-3">{row.status}</td>
                  <td className="p-3">{row.nftTokenId ? `#${row.nftTokenId}` : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && !error && <tr><td className="p-4 text-muted-foreground" colSpan={6}>Записей пока нет.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

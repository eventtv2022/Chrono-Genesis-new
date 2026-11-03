import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCitizen } from "@/context/CitizenContext";
import { Link } from "wouter";

type Note = {
  serialNumber: number;
  slogan: string;
  status: string;
  nftTokenId: string | null;
  nftTransactionHash: string | null;
};

export function SouvenirDarmin() {
  const { authToken, citizen } = useCitizen();
  const [notes, setNotes] = useState<Note[]>([]);
  const [portrait, setPortrait] = useState<File | null>(null);
  const [slogan, setSlogan] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [images, setImages] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headers: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  const loadNotes = useCallback(async () => {
    if (!authToken) return;
    const response = await fetch("/api/souvenir-darmins/me", { headers: { Authorization: `Bearer ${authToken}` } });
    if (!response.ok) throw new Error("Не удалось загрузить реестр банкнот.");
    setNotes(await response.json() as Note[]);
  }, [authToken]);

  useEffect(() => { void loadNotes().catch((reason: Error) => setError(reason.message)); }, [loadNotes]);

  useEffect(() => {
    if (!authToken || notes.length === 0) { setImages({}); return; }
    let active = true;
    const urls: string[] = [];
    void Promise.all(notes.map(async (note) => {
      const response = await fetch(`/api/souvenir-darmins/${note.serialNumber}/image`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!response.ok) return [note.serialNumber, ""] as const;
      const url = URL.createObjectURL(await response.blob());
      urls.push(url);
      return [note.serialNumber, url] as const;
    })).then((entries) => { if (active) setImages(Object.fromEntries(entries)); });
    return () => { active = false; urls.forEach(URL.revokeObjectURL); };
  }, [authToken, notes]);

  async function issueNote() {
    if (!authToken || !portrait || !slogan.trim()) { setError("Войдите в аккаунт, добавьте портрет и слоган."); return; }
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("portrait", portrait);
      form.append("slogan", slogan.trim());
      const response = await fetch("/api/souvenir-darmins", { method: "POST", headers, body: form });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось выпустить банкноту.");
      setPortrait(null); setSlogan("");
      await loadNotes();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка выпуска банкноты.");
    } finally { setBusy(false); }
  }

  async function mintNft(serialNumber: number) {
    if (!walletAddress.trim()) { setError("Введите адрес Ethereum-кошелька."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/souvenir-darmins/${serialNumber}/mint-nft`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ walletAddress: walletAddress.trim() }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось выпустить NFT.");
      await loadNotes();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка выпуска NFT.");
    } finally { setBusy(false); }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/shop"><span className="text-sm text-primary hover:underline">← Казначейство</span></Link>
        <header>
          <h1 className="text-3xl font-bold">Печатать Свой ДарМин</h1>
          <p className="mt-2 text-sm text-muted-foreground">PNG-банкнота с портретом и слоганом. Стоимость выпуска — 1 купленный за фиат Дармин + комиссия 2%.</p>
        </header>
        {!citizen && <p className="rounded border border-amber-500/40 p-3 text-sm text-amber-300">Для выпуска войдите в аккаунт.</p>}
        <Card>
          <CardHeader><CardTitle>Создать сувенирную банкноту</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPortrait(event.target.files?.[0] ?? null)} />
            <Input value={slogan} maxLength={80} onChange={(event) => setSlogan(event.target.value)} placeholder="Слоган — до 80 символов" />
            <Button disabled={busy || !citizen} onClick={() => void issueNote()}>{busy ? "Обработка…" : "Выпустить за 1 Д + 2%"}</Button>
          </CardContent>
        </Card>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Мои сувенирные Дармины</h2>
          {notes.map((note) => (
            <Card key={note.serialNumber}>
              <CardContent className="space-y-3 p-4">
                {images[note.serialNumber] && <img src={images[note.serialNumber]} alt={`Сувенирный ДарМин ${note.serialNumber}`} className="w-full rounded-lg border border-border" />}
                <p className="font-mono font-bold text-primary">DM {String(note.serialNumber).padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1 ")}</p>
                <p>{note.slogan}</p>
                {images[note.serialNumber] && <a className="text-sm text-primary underline" href={images[note.serialNumber]} download={`darmin-${note.serialNumber}.png`}>Скачать PNG</a>}
                {note.nftTokenId
                  ? <p className="text-sm text-muted-foreground">NFT #{note.nftTokenId} · {note.nftTransactionHash}</p>
                  : <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} placeholder="Sepolia wallet 0x…" />
                    <Button disabled={busy} onClick={() => void mintNft(note.serialNumber)}>Создать NFT</Button>
                  </div>}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </Layout>
  );
}

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
type EscrowDetails = { serialNumber: number; escrowAddress: string; contractAddress: string; tokenId: string; alreadyEscrowed?: boolean };

export function SouvenirDarmin() {
  const { authToken, citizen } = useCitizen();
  const [notes, setNotes] = useState<Note[]>([]);
  const [portrait, setPortrait] = useState<File | null>(null);
  const [slogan, setSlogan] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [startingPrice, setStartingPrice] = useState("1");
  const [escrow, setEscrow] = useState<EscrowDetails | null>(null);
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

  async function prepareAuction(serialNumber: number) {
    setError("");
    try {
      const response = await fetch(`/api/auctions/souvenir-darmin/${serialNumber}/escrow`, { headers });
      const data = await response.json() as EscrowDetails & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось подготовить escrow.");
      setEscrow(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка подготовки escrow."); }
  }

  async function listAuction(serialNumber: number) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auctions/souvenir-darmin", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ serialNumber, startingPrice: Number(startingPrice), durationHours: 24 }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось разместить NFT.");
      setEscrow(null);
      await loadNotes();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка размещения NFT."); }
    finally { setBusy(false); }
  }

  async function returnNft(serialNumber: number) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/auctions/souvenir-darmin/${serialNumber}/return`, {
        method: "POST",
        headers,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось вернуть NFT.");
      setEscrow(null);
      await loadNotes();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка возврата NFT."); }
    finally { setBusy(false); }
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
                {note.status === "NFT_MINTED" && (
                  <div className="space-y-2 border-t border-border pt-3">
                    {!escrow || escrow.serialNumber !== note.serialNumber ? (
                      <Button variant="outline" disabled={busy} onClick={() => void prepareAuction(note.serialNumber)}>Подготовить к аукциону</Button>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">{escrow.alreadyEscrowed ? "NFT уже находится в escrow. Укажите начальную цену и подтвердите размещение." : "Переведите NFT вручную на Sepolia в escrow-кошелёк, дождитесь подтверждения и затем нажмите «Разместить»."}</p>
                        <p className="break-all font-mono text-xs text-primary">Escrow: {escrow.escrowAddress}</p>
                        <p className="break-all font-mono text-xs text-muted-foreground">Contract {escrow.contractAddress} · token #{escrow.tokenId}</p>
                        <Input type="number" min="0.01" step="0.01" value={startingPrice} onChange={(event) => setStartingPrice(event.target.value)} placeholder="Начальная цена в Д" />
                        <Button disabled={busy || Number(startingPrice) <= 0} onClick={() => void listAuction(note.serialNumber)}>Разместить на 24 часа</Button>
                        <Button variant="ghost" disabled={busy} onClick={() => void returnNft(note.serialNumber)}>Вернуть NFT из escrow</Button>
                      </>
                    )}
                  </div>
                )}
                {note.status === "AUCTION_LISTED" && (
                  <div className="space-y-2">
                    <p className="text-sm text-amber-300">NFT находится в escrow и выставлен на аукцион.</p>
                    <Button variant="outline" disabled={busy} onClick={() => void returnNft(note.serialNumber)}>Отменить, если ставок нет</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </Layout>
  );
}

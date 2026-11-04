import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, Search, Timer } from "lucide-react";
import { useListCitizens, getListCitizensQueryKey } from "@workspace/api-client-react";
import { useLanguage } from "@/context/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CitizenTimeProfile {
  citizenNumber: string;
  joinedAt: string;
  availableAt: string | null;
  status: string;
}

function nextAnniversary(joinedAt: Date, now: Date): Date {
  let year = now.getFullYear();
  let anniversary = new Date(year, joinedAt.getMonth(), joinedAt.getDate());
  if (anniversary.getMonth() !== joinedAt.getMonth()) {
    anniversary = new Date(year, joinedAt.getMonth() + 1, 0);
  }
  if (anniversary < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    year += 1;
    anniversary = new Date(year, joinedAt.getMonth(), joinedAt.getDate());
    if (anniversary.getMonth() !== joinedAt.getMonth()) {
      anniversary = new Date(year, joinedAt.getMonth() + 1, 0);
    }
  }
  return anniversary;
}

export function CitizenTimeRegistry() {
  const { lang } = useLanguage();
  const english = lang !== "ru";
  const [query, setQuery] = useState("");
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [profile, setProfile] = useState<CitizenTimeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { data: citizens, isLoading, isError } = useListCitizens({
    query: { queryKey: getListCitizensQueryKey() },
  });

  const filtered = useMemo(
    () => (citizens ?? []).filter(({ citizenNumber }) => citizenNumber.includes(query.trim())),
    [citizens, query],
  );

  useEffect(() => {
    if (!selectedNumber) {
      setProfile(null);
      return;
    }
    const controller = new AbortController();
    setProfileLoading(true);
    setProfileError(false);
    fetch(`/api/citizens/number/${encodeURIComponent(selectedNumber)}/time-profile`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load citizen time profile");
        return await response.json() as CitizenTimeProfile;
      })
      .then(setProfile)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setProfileError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setProfileLoading(false);
      });
    return () => controller.abort();
  }, [selectedNumber]);

  useEffect(() => {
    if (!profile || profile.status !== "pending") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [profile]);

  const joinedAt = profile ? new Date(profile.joinedAt) : null;
  const joinedDays = joinedAt ? Math.max(0, Math.floor((now - joinedAt.getTime()) / 86_400_000)) : 0;
  const anniversary = joinedAt ? nextAnniversary(joinedAt, new Date(now)) : null;
  const anniversaryDays = anniversary ? Math.max(0, Math.ceil((anniversary.getTime() - now) / 86_400_000)) : 0;
  const activationSeconds = profile?.availableAt
    ? Math.max(0, Math.floor((new Date(profile.availableAt).getTime() - now) / 1000))
    : 0;
  const status = profile?.status ?? "issued";
  const statusLabel = status === "pending"
    ? (english ? "In review" : "На проверке")
    : status === "rejected"
      ? (english ? "Rejected" : "Отклонён")
      : (english ? "Active citizen" : "Активный гражданин");

  return (
    <section id="citizens-registry" className="scroll-mt-8 space-y-4">
      <div>
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary">
          {english ? "TimeNation directory" : "Каталог TimeNation"}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">
          {english ? "Citizen registry" : "Реестр граждан"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {english
            ? "Search a passport number and open its time profile."
            : "Найдите номер паспорта и откройте временную карточку гражданина."}
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {english ? "Passport numbers" : "Номера паспортов"} · {isLoading ? "…" : filtered.length}
          </CardTitle>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={english ? "Search passport number" : "Поиск по номеру паспорта"}
              aria-label={english ? "Search passport number" : "Поиск по номеру паспорта"}
              className="border-border bg-secondary pl-9 font-mono"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-10 bg-secondary" />)}
            </div>
          ) : isError ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {english ? "The registry could not be loaded." : "Не удалось загрузить реестр."}
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {english ? "No passport numbers found." : "Номера паспортов не найдены."}
            </p>
          ) : (
            <div className="max-h-[440px] divide-y divide-border/60 overflow-y-auto">
              {filtered.map(({ citizenNumber }, index) => (
                <div key={citizenNumber} className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-secondary/30 sm:px-5">
                  <span className="text-xs font-mono text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedNumber(citizenNumber)}
                    className="ml-auto flex items-center gap-2 rounded px-2 py-1 font-mono font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`${english ? "Open time profile for passport" : "Открыть временную карточку паспорта"} ${citizenNumber}`}
                  >
                    №{citizenNumber}
                    <Clock3 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selectedNumber !== null} onOpenChange={(open) => { if (!open) setSelectedNumber(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{english ? "Citizen time profile" : "Временная карточка гражданина"}</DialogTitle>
            <DialogDescription>
              {english ? "Passport" : "Паспорт"} №{selectedNumber ?? ""}
            </DialogDescription>
          </DialogHeader>

          {profileLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-16" /></div>
          ) : profileError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {english ? "Could not load this time profile. Please try again." : "Не удалось загрузить карточку. Попробуйте ещё раз."}
            </p>
          ) : profile && joinedAt ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{english ? "TimeNation tenure" : "Стаж в TimeNation"}</p>
                  <p className="mt-1 text-2xl font-bold font-mono text-primary">
                    {joinedDays.toLocaleString(english ? "en-US" : "ru-RU")} {english ? "days" : "дней"}
                  </p>
                </div>
                <Timer className="h-8 w-8 text-primary/70" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TimeMilestone
                  icon={CalendarClock}
                  label={english ? "Joined TimeNation" : "Регистрация"}
                  value={joinedAt.toLocaleDateString(english ? "en-US" : "ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                />
                <TimeMilestone
                  icon={Clock3}
                  label={english ? "Next anniversary" : "До годовщины"}
                  value={`${anniversaryDays} ${english ? "days" : "дн."}`}
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">{english ? "Passport status" : "Статус паспорта"}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === "issued" ? "bg-emerald-500/10 text-emerald-400" : status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-400"}`}>
                  {statusLabel}
                </span>
              </div>

              {status === "pending" && profile.availableAt && activationSeconds > 0 && (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
                  <p className="font-medium">{english ? "Activation window opens in" : "До начала активации паспорта"}</p>
                  <p className="mt-1 font-mono text-amber-300">
                    {Math.floor(activationSeconds / 3600)}:{String(Math.floor((activationSeconds % 3600) / 60)).padStart(2, "0")}:{String(activationSeconds % 60).padStart(2, "0")}
                  </p>
                </div>
              )}
              {status === "pending" && profile.availableAt && activationSeconds === 0 && (
                <p className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
                  {english ? "The review time has ended; passport issuance is pending." : "Срок проверки завершён, ожидается выдача паспорта."}
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {english
                  ? "This public card shows time milestones only. Personal data and balance are not displayed."
                  : "В публичной карточке отображаются только временные этапы. Личные данные и баланс скрыты."}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TimeMilestone({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

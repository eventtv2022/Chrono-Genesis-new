import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Clock, AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  Brain, Users, Settings, Loader2, Lock,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function govFetch(path: string, password: string, opts: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Gov-Password": password,
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: number;
  citizenId: number | null;
  taskDescription: string;
  estimatedMinutes: number;
  actualMinutes: number | null;
  deviationPercent: number | null;
  complexityLevel: string;
  justification: string;
  requiresCalibration: number;
  moderatedByName: string | null;
  moderatedAt: string | null;
  createdAt: string;
}

interface GovCitizen {
  id: number;
  name: string;
  citizenNumber: string | null;
  govRole: string;
  meritScore: number;
  rank: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ComplexityBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    low: "bg-green-900/40 text-green-300 border-green-700",
    medium: "bg-yellow-900/40 text-yellow-300 border-yellow-700",
    high: "bg-red-900/40 text-red-300 border-red-700",
  };
  const labels: Record<string, string> = { low: "Низкая", medium: "Средняя", high: "Высокая" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${map[level] ?? "bg-secondary text-muted-foreground"}`}>
      {labels[level] ?? level}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    citizen: "bg-secondary text-muted-foreground border-border",
    labor_officer: "bg-blue-900/40 text-blue-300 border-blue-700",
    gov_admin: "bg-purple-900/40 text-purple-300 border-purple-700",
  };
  const labels: Record<string, string> = {
    citizen: "Гражданин",
    labor_officer: "Сотрудник Минтруда",
    gov_admin: "Администратор",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${map[role] ?? "bg-secondary"}`}>
      {labels[role] ?? role}
    </span>
  );
}

// ── Password gate ─────────────────────────────────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/government/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        toast({ title: "Доступ разрешён", description: "Добро пожаловать в кабинет Министерства Труда" });
        onUnlock(pw);
      } else {
        setError("Неверный пароль правительственного контура");
      }
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <Card className="w-full max-w-md border-yellow-800/40 bg-card">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-yellow-900/30 border border-yellow-700/40">
              <Lock className="w-8 h-8 text-yellow-400" />
            </div>
          </div>
          <CardTitle className="text-xl">Правительственный контур</CardTitle>
          <p className="text-sm text-muted-foreground">
            Министерство Труда TimeNation · Только для уполномоченных сотрудников
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Правительственный пароль</label>
              <Input
                type="password"
                placeholder="Введите пароль доступа"
                value={pw}
                onChange={e => setPw(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
              </p>
            )}
            <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-semibold" disabled={loading || !pw}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
              Войти
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Task Auditor tab ──────────────────────────────────────────────────────────

function AuditorTab({ password }: { password: string }) {
  const [taskDesc, setTaskDesc] = useState("");
  const [citizenId, setCitizenId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditLog | null>(null);
  const { toast } = useToast();

  async function handleAudit() {
    if (!taskDesc.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await govFetch("/api/government/audit/task", password, {
        method: "POST",
        body: JSON.stringify({
          taskDescription: taskDesc,
          citizenId: citizenId ? parseInt(citizenId) : undefined,
        }),
      });
      const data = await res.json() as { log?: AuditLog; error?: string };
      if (!res.ok) {
        toast({ title: "Ошибка", description: data.error ?? "Неизвестная ошибка", variant: "destructive" });
        return;
      }
      setResult(data.log ?? null);
      toast({ title: "Аудит выполнен", description: `Оценка: ${data.log?.estimatedMinutes ?? "?"} Д` });
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="w-4 h-4 text-blue-400" />
            Новый аудит задачи
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Описание задачи</label>
            <Textarea
              placeholder="Опишите задачу подробно: технология, объём работы, уровень сложности..."
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
              className="bg-secondary border-border min-h-[120px] resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">ID гражданина (необязательно)</label>
            <Input
              type="number"
              placeholder="Например: 42"
              value={citizenId}
              onChange={e => setCitizenId(e.target.value)}
              className="bg-secondary border-border max-w-xs"
            />
          </div>
          <Button
            onClick={() => void handleAudit()}
            disabled={loading || !taskDesc.trim()}
            className="bg-blue-700 hover:bg-blue-600"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
            Оценить задачу ИИ-аудитором
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-green-800/40 bg-green-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-green-300">
              <CheckCircle className="w-4 h-4" />
              Результат аудита #{result.id}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Оценка времени</p>
                <p className="text-3xl font-bold text-green-300">{result.estimatedMinutes} Д</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Сложность</p>
                <div className="mt-1"><ComplexityBadge level={result.complexityLevel} /></div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Обоснование ИИ</p>
              <p className="text-sm text-foreground/90 leading-relaxed">{result.justification}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Audit Logs tab ────────────────────────────────────────────────────────────

function LogsTab({ password }: { password: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [calibOnly, setCalibOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actualInputs, setActualInputs] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<number | null>(null);
  const { toast } = useToast();

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await govFetch(
        `/api/government/audit/logs${calibOnly ? "?calibrationOnly=true" : ""}`,
        password
      );
      const data = await res.json() as { logs?: AuditLog[] };
      setLogs(data.logs ?? []);
    } catch {
      toast({ title: "Ошибка загрузки логов", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [password, calibOnly, toast]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  async function submitActual(log: AuditLog) {
    const val = parseFloat(actualInputs[log.id] ?? "");
    if (!val || val <= 0) { toast({ title: "Введите корректное время", variant: "destructive" }); return; }
    setSubmitting(log.id);
    try {
      const res = await govFetch(`/api/government/audit/logs/${log.id}`, password, {
        method: "PATCH",
        body: JSON.stringify({ actualMinutes: val }),
      });
      const data = await res.json() as { log?: AuditLog; error?: string };
      if (!res.ok) { toast({ title: "Ошибка", description: data.error, variant: "destructive" }); return; }
      toast({
        title: `Отклонение: ${data.log?.deviationPercent?.toFixed(1) ?? "?"}%`,
        description: data.log?.requiresCalibration ? "⚠️ Требует калибровки" : "✓ В норме",
      });
      void loadLogs();
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={calibOnly}
              onChange={e => setCalibOnly(e.target.checked)}
              className="rounded"
            />
            Только требующие калибровки
          </label>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Обновить"}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Записей не найдено
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <Card key={log.id} className={`border transition-colors ${log.requiresCalibration ? "border-orange-700/40 bg-orange-950/10" : "border-border"}`}>
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {log.requiresCalibration === 1 && (
                      <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{log.taskDescription}</span>
                    <ComplexityBadge level={log.complexityLevel} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>#{log.id}</span>
                    <span>Оценка: <span className="text-foreground font-mono">{log.estimatedMinutes} Д</span></span>
                    {log.actualMinutes != null && (
                      <span>Факт: <span className="font-mono">{log.actualMinutes} Д</span></span>
                    )}
                    {log.deviationPercent != null && (
                      <span className={log.requiresCalibration ? "text-orange-400" : "text-green-400"}>
                        Δ {log.deviationPercent.toFixed(1)}%
                      </span>
                    )}
                    <span>{new Date(log.createdAt).toLocaleString("ru")}</span>
                  </div>
                </div>
                {expandedId === log.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>

              {expandedId === log.id && (
                <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{log.justification}</p>

                  {log.actualMinutes == null && (
                    <div className="flex items-end gap-2">
                      <div className="space-y-1 flex-1 max-w-xs">
                        <label className="text-xs text-muted-foreground">Фактическое время (мин / Д)</label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={actualInputs[log.id] ?? ""}
                          onChange={e => setActualInputs(prev => ({ ...prev, [log.id]: e.target.value }))}
                          className="bg-secondary border-border h-8 text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void submitActual(log)}
                        disabled={submitting === log.id}
                        className="bg-blue-700 hover:bg-blue-600 h-8"
                      >
                        {submitting === log.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Записать"}
                      </Button>
                    </div>
                  )}
                  {log.moderatedAt && (
                    <p className="text-xs text-muted-foreground">
                      Промодерировано: {new Date(log.moderatedAt).toLocaleString("ru")}
                      {log.moderatedByName ? ` · ${log.moderatedByName}` : ""}
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── System Prompt tab ─────────────────────────────────────────────────────────

function PromptTab({ password }: { password: string }) {
  const [promptText, setPromptText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    void (async () => {
      try {
        const res = await govFetch("/api/government/system-prompt", password);
        const data = await res.json() as { promptText?: string };
        setPromptText(data.promptText ?? "");
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, [password]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await govFetch("/api/government/system-prompt", password, {
        method: "PUT",
        body: JSON.stringify({ promptText }),
      });
      if (res.ok) {
        toast({ title: "Промт обновлён", description: "Новые настройки ИИ-аудитора применены" });
      } else {
        const d = await res.json() as { error?: string };
        toast({ title: "Ошибка", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="w-4 h-4 text-purple-400" />
            Системный промт ИИ-аудитора
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Инструкции, которые получает Gemini при каждом запросе на аудит. Изменения вступают в силу немедленно.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
            </div>
          ) : (
            <>
              <Textarea
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                className="bg-secondary border-border min-h-[400px] resize-none font-mono text-sm"
              />
              <Button
                onClick={() => void handleSave()}
                disabled={saving || promptText.length < 20}
                className="bg-purple-700 hover:bg-purple-600"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2" />}
                Сохранить промт
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Citizens tab ──────────────────────────────────────────────────────────────

function CitizensTab({ password }: { password: string }) {
  const [citizens, setCitizens] = useState<GovCitizen[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    void (async () => {
      try {
        const res = await govFetch("/api/government/citizens", password);
        const data = await res.json() as { citizens?: GovCitizen[] };
        setCitizens(data.citizens ?? []);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, [password]);

  async function setRole(citizenId: number, govRole: string) {
    setUpdating(citizenId);
    try {
      const res = await govFetch(`/api/government/citizens/${citizenId}/gov-role`, password, {
        method: "PATCH",
        body: JSON.stringify({ govRole }),
      });
      if (res.ok) {
        setCitizens(prev => prev.map(c => c.id === citizenId ? { ...c, govRole } : c));
        toast({ title: "Роль обновлена" });
      }
    } catch { /* ignore */ } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1">
          {citizens.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.citizenNumber && <span className="text-xs text-muted-foreground font-mono">#{c.citizenNumber}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <RoleBadge role={c.govRole} />
                  <span className="text-xs text-muted-foreground">{c.rank} · {c.meritScore.toFixed(0)} Merit</span>
                </div>
              </div>
              <select
                value={c.govRole}
                disabled={updating === c.id}
                onChange={e => void setRole(c.id, e.target.value)}
                className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
              >
                <option value="citizen">Гражданин</option>
                <option value="labor_officer">Сотрудник Минтруда</option>
                <option value="gov_admin">Администратор</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LaborDashboard() {
  const [password, setPassword] = useState<string | null>(
    () => sessionStorage.getItem("gov_pw")
  );

  useEffect(() => {
    document.title = "Министерство Труда | TimeNation";
  }, []);

  function handleUnlock(pw: string) {
    sessionStorage.setItem("gov_pw", pw);
    setPassword(pw);
  }

  if (!password) {
    return (
      <Layout>
        <PasswordGate onUnlock={handleUnlock} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-900/30 border border-yellow-700/40">
            <Shield className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Министерство Труда</h1>
            <p className="text-sm text-muted-foreground font-mono">Правительственный контур TimeNation · ИИ-Аудитор Времени</p>
          </div>
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { sessionStorage.removeItem("gov_pw"); setPassword(null); }}
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" /> Выйти
            </Button>
          </div>
        </div>

        <Tabs defaultValue="auditor">
          <TabsList className="bg-secondary">
            <TabsTrigger value="auditor" className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" /> ИИ-Аудитор
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Логи аудита
            </TabsTrigger>
            <TabsTrigger value="prompt" className="flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Промт ИИ
            </TabsTrigger>
            <TabsTrigger value="citizens" className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Роли граждан
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auditor" className="mt-4">
            <AuditorTab password={password} />
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <LogsTab password={password} />
          </TabsContent>
          <TabsContent value="prompt" className="mt-4">
            <PromptTab password={password} />
          </TabsContent>
          <TabsContent value="citizens" className="mt-4">
            <CitizensTab password={password} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

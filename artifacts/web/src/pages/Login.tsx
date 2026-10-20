import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useLoginCitizen } from "@workspace/api-client-react";
import { ArrowLeft, KeyRound, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useCitizen, type CitizenProfile } from "@/context/CitizenContext";

const loginSchema = z.object({
  phone: z.string().min(5, "Введите номер телефона"),
  password: z.string().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

export function Login() {
  const { setCitizen, setAuthToken } = useCitizen();
  const [, navigate] = useLocation();
  const login = useLoginCitizen();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: "", password: "" },
  });

  function submit(values: LoginValues) {
    setError(null);
    login.mutate(
      { data: { phone: values.phone.trim(), ...(values.password ? { password: values.password } : {}) } },
      {
        onSuccess: (session) => {
          const { authToken, ...profile } = session;
          setCitizen(profile as CitizenProfile);
          setAuthToken(authToken);
          const returnTo = new URLSearchParams(window.location.search).get("returnTo");
          const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null;
          navigate(safeReturnTo ?? (profile.onboardingCompleted === false ? "/onboarding" : "/"));
        },
        onError: (err) => {
          const apiError = err as Error & { data?: { error?: string } };
          setError(apiError.data?.error ?? "Не удалось войти. Проверьте телефон и пароль.");
        },
      },
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#050713] px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-2xl border border-cyan-300/20 bg-white/[0.04] p-6 shadow-[0_20px_100px_rgba(0,0,0,.35)] md:p-8">
        <Link href="/welcome" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-white" data-testid="link-login-back">
          <ArrowLeft className="h-4 w-4" /> На главную
        </Link>
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.22em] text-primary">TimeNation</p>
        <h1 className="mt-2 text-3xl font-bold">Войти в кабинет</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Войдите, чтобы продолжить работу или вернуться к незавершённому обучению.</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="mt-7 space-y-5">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Телефон</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input {...field} type="tel" autoComplete="tel" className="pl-10" placeholder="+90…" data-testid="input-login-phone" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Пароль</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input {...field} type="password" autoComplete="current-password" className="pl-10" placeholder="Введите пароль" data-testid="input-login-password" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && <p className="text-sm text-destructive-foreground" role="alert" data-testid="status-login-error">{error}</p>}
            <Button type="submit" className="w-full" disabled={login.isPending} data-testid="button-login-submit">
              {login.isPending ? "Входим…" : "Войти"}
            </Button>
          </form>
        </Form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ещё нет паспорта? <Link href="/register" className="font-semibold text-primary hover:underline" data-testid="link-login-register">Начать регистрацию</Link>
        </p>
      </section>
    </main>
  );
}

import { Layout } from "@/components/Layout";
import { useLanguage } from "@/context/LanguageContext";

const copy = {
  en: {
    terms: {
      title: "Terms of Service",
      intro: "These terms govern your use of the TimeNation website, mobile application, and related services.",
      sections: [
        ["About TimeNation", "TimeNation is a digital platform with community, focus, marketplace, digital-asset, and other features. References to citizens, passports, or government are platform terminology and do not confer legal citizenship or constitute official identity documents."],
        ["Darmins and platform activity", "Darmins are units used within the TimeNation ecosystem. Their availability and use depend on the feature and transaction. Some Darmin balances may be purchased; other balances may be earned or transferred through platform features. Darmins are not represented here as government-issued money or a bank deposit."],
        ["Payments", "Card payments in EUR are processed through Stripe. USDT payments through TRC20 or WalletConnect use blockchain networks and are not processed by Stripe. The payment method and amount are shown before you confirm a transaction. Network fees, confirmation times, and reversibility may differ by method."],
        ["Refunds", "You may request a refund within 14 calendar days of payment for payments made through any payment method. See the Refund Policy for how to submit a request. Mandatory rights under applicable law are not limited by these terms."],
        ["Use and responsibility", "Use the platform lawfully and do not misuse, disrupt, or attempt to compromise its services. Blockchain transactions may be irreversible once confirmed; contact support promptly if you believe a payment was made in error."],
        ["Contact", "Questions about these terms or a payment can be sent to support@timenation.info."],
      ],
    },
    refund: {
      title: "Refund Policy",
      intro: "This policy applies to payments made to TimeNation using any payment method, including card payments and cryptocurrency transfers.",
      sections: [
        ["14-day request period", "You may request a refund within 14 calendar days after the payment date. This policy applies regardless of whether you paid by card through Stripe, USDT on TRC20, or WalletConnect."],
        ["How to request", "Email support@timenation.info from your account email, if available. Include the payment date, amount and currency, payment method, transaction or order reference, and the reason for your request. Do not email private keys, recovery phrases, passwords, or full payment-card details."],
        ["Review and return method", "We will verify the payment and refund requests submitted within the 14-day period. Where reasonably possible, the refund will go to the original payment method. For blockchain payments, we will send a new transfer to a wallet address you confirm with us. Blockchain confirmation times may vary."],
        ["Legal rights", "This policy does not remove any mandatory refund or withdrawal rights you may have under applicable law."],
      ],
    },
  },
  ru: {
    terms: {
      title: "Условия использования",
      intro: "Эти условия регулируют использование сайта TimeNation, мобильного приложения и связанных сервисов.",
      sections: [
        ["О TimeNation", "TimeNation — цифровая платформа с функциями сообщества, фокус-сессий, маркетплейса, цифровых активов и другими возможностями. Термины «гражданин», «паспорт» и «государство» используются внутри платформы и не предоставляют юридического гражданства или официального документа, удостоверяющего личность."],
        ["Дармины и активность на платформе", "Дармины используются внутри экосистемы TimeNation. Возможность их использования зависит от конкретной функции и операции. Некоторые Дармины можно приобрести, другие — получить или передать через функции платформы. Дармины не являются государственными денежными средствами или банковским вкладом."],
        ["Платежи", "Оплата банковской картой в EUR обрабатывается через Stripe. Платежи в USDT через TRC20 или WalletConnect выполняются в блокчейн-сетях и не обрабатываются Stripe. Способ оплаты и сумма отображаются до подтверждения операции. Сетевые комиссии, сроки подтверждения и возможность отмены зависят от способа оплаты."],
        ["Возвраты", "Запросить возврат можно в течение 14 календарных дней с даты оплаты при любом способе оплаты. Порядок запроса описан в Политике возврата. Эти условия не ограничивают обязательные права, предусмотренные применимым законодательством."],
        ["Использование и ответственность", "Используйте платформу законно и не нарушайте её работу и безопасность. Подтверждённые блокчейн-транзакции могут быть необратимыми; если вы считаете, что платёж совершён ошибочно, как можно скорее обратитесь в поддержку."],
        ["Контакты", "Вопросы об условиях или платеже направляйте на support@timenation.info."],
      ],
    },
    refund: {
      title: "Политика возврата средств",
      intro: "Политика распространяется на платежи TimeNation, совершённые любым способом, включая оплату картой и переводы криптовалюты.",
      sections: [
        ["Срок — 14 дней", "Запросить возврат можно в течение 14 календарных дней с даты платежа. Правило действует для оплаты картой через Stripe, USDT в сети TRC20 и WalletConnect."],
        ["Как отправить запрос", "Напишите на support@timenation.info с адреса электронной почты аккаунта, если он указан. Укажите дату, сумму и валюту платежа, способ оплаты, номер заказа или идентификатор транзакции и причину запроса. Не отправляйте закрытые ключи, seed-фразы, пароли или полные данные банковской карты."],
        ["Рассмотрение и способ возврата", "Мы проверим платёж и вернём средства по запросу, отправленному в течение 14-дневного срока. По возможности возврат будет выполнен исходным способом оплаты. Для блокчейн-платежа мы отправим новую транзакцию на адрес кошелька, который вы подтвердите. Сроки подтверждения блокчейн-транзакции могут различаться."],
        ["Права по закону", "Политика не отменяет обязательные права на возврат или отказ от покупки, предусмотренные применимым законодательством."],
      ],
    },
  },
} as const;

function LegalPage({ kind }: { kind: "terms" | "refund" }) {
  const { lang } = useLanguage();
  const locale = lang === "ru" ? "ru" : "en";
  const page = copy[locale][kind];
  return (
    <Layout>
      <article className="mx-auto max-w-3xl space-y-6 py-6">
        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">TimeNation · Legal</p>
          <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
          <p className="text-sm text-muted-foreground">{page.intro}</p>
        </header>
        {page.sections.map(([title, body]) => (
          <section key={title} className="rounded-md border border-border bg-card p-5">
            <h2 className="mb-2 text-base font-semibold">{title}</h2>
            <p className="text-sm leading-7 text-muted-foreground">{body}</p>
          </section>
        ))}
      </article>
    </Layout>
  );
}

export function Terms() { return <LegalPage kind="terms" />; }
export function Refund() { return <LegalPage kind="refund" />; }

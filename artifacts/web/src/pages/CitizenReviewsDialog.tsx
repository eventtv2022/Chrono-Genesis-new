import { useEffect } from "react";

const reviews = [
  { name: "Elif Yılmaz", language: "Türkçe", lang: "tr", english: "TimeNation reminds me that a minute is not just something to spend—it is a choice about what matters.", native: "TimeNation bana bir dakikanın sadece harcanacak bir şey olmadığını, neyin önemli olduğuna dair bir seçim olduğunu hatırlatıyor." },
  { name: "Layla Haddad", language: "العربية", lang: "ar", english: "I joined because I want to use my time with care, courage, and attention to the people around me.", native: "انضممت لأنني أريد أن أعيش وقتي بعناية وشجاعة، وأن أهتم بالناس من حولي." },
  { name: "Camila Rojas", language: "Español", lang: "es", english: "For me, citizenship means choosing to make time for the people and things I love.", native: "Para mí, la ciudadanía significa elegir dedicar tiempo a las personas y las cosas que amo." },
  { name: "Aïssatou Diop", language: "Français", lang: "fr", english: "I believe our time gains meaning when we share it, create, and take responsibility together.", native: "Je crois que notre temps prend tout son sens lorsque nous le partageons, créons et assumons nos responsabilités ensemble." },
  { name: "Lukas Schneider", language: "Deutsch", lang: "de", english: "TimeNation encourages me to think about what I want my minutes to stand for.", native: "TimeNation regt mich dazu an, darüber nachzudenken, wofür meine Minuten stehen sollen." },
  { name: "Inês Ferreira", language: "Português", lang: "pt", english: "I joined to remember that being present with others can matter more than simply being busy.", native: "Entrei para me lembrar de que estar presente com os outros pode ser mais importante do que estar sempre ocupado." },
  { name: "Haruto Sato", language: "日本語", lang: "ja", english: "Thinking of a minute as a choice helps me pay closer attention to how I live each day.", native: "一分を一つの選択として考えることで、毎日をどう生きるか、より意識するようになりました。" },
  { name: "Kim Seo-yun", language: "한국어", lang: "ko", english: "I want to spend my time caring for people I love and making memories together.", native: "저는 소중한 사람들을 돌보고 함께 추억을 만들며 시간을 보내고 싶어요." },
  { name: "Aanya Sharma", language: "हिन्दी", lang: "hi", english: "TimeNation reminds me that small choices can reflect the values I want to live by.", native: "टाइमनेशन मुझे याद दिलाता है कि छोटे-छोटे चुनाव भी उन मूल्यों को दिखा सकते हैं जिनके अनुसार मैं जीना चाहता हूँ।" },
  { name: "Farhan Rahman", language: "বাংলা", lang: "bn", english: "I believe time becomes meaningful when we use it to learn, create, and help one another.", native: "আমি যোগ দিয়েছি, কারণ আমার বিশ্বাস—শেখা, সৃষ্টি করা এবং একে অপরকে সাহায্য করার কাজে সময় দিলে তা অর্থবহ হয়ে ওঠে।" },
  { name: "Li Wei", language: "中文", lang: "zh", english: "Citizenship reminds me to live in the present and not take other people's time for granted.", native: "对我来说，公民身份提醒我活在当下，也不要把别人的时间视为理所当然。" },
  { name: "Marina Volkova", language: "Русский", lang: "ru", english: "I joined to remember that time matters most when I share it with people I care about.", native: "Я присоединилась, чтобы помнить: время особенно ценно, когда я делю его с близкими мне людьми." },
  { name: "Olena Kovalenko", language: "Українська", lang: "uk", english: "I want my time to reflect kindness, courage, and the hope that we can build something together.", native: "Я хочу, щоб мій час відображав доброту, сміливість і віру в те, що ми можемо створити щось разом." },
  { name: "Giulia Romano", language: "Italiano", lang: "it", english: "TimeNation makes me reflect on how I can turn an ordinary moment into something meaningful.", native: "TimeNation mi fa riflettere su come trasformare un momento qualunque in qualcosa di significativo." },
  { name: "Neema Mwangi", language: "Kiswahili", lang: "sw", english: "I believe our time matters more when we use it to care for one another and our community.", native: "Ninaamini muda wetu una maana zaidi tunapoutumia kujali wengine na jamii yetu." },
  { name: "Tunde Adeyemi", language: "Yorùbá", lang: "yo", english: "I joined because I want my choices to show respect for my time and for the time of others.", native: "Mo darapọ̀ mọ́ TimeNation nítorí mo fẹ́ kí àwọn ìpinnu mi fi ọ̀wọ̀ hàn fún àkókò tèmi àti ti àwọn ẹlòmíràn." },
  { name: "Nima Farhadi", language: "فارسی", lang: "fa", english: "The idea that every minute holds a choice helps me live with more intention.", native: "این ایده که هر دقیقه فرصتی برای انتخاب است، به من کمک می‌کند آگاهانه‌تر زندگی کنم." },
  { name: "Noa Cohen", language: "עברית", lang: "he", english: "I joined to focus on what I can give to the present instead of waiting for the perfect moment.", native: "הצטרפתי כדי להתמקד במה שאני יכול לתת לרגע הזה, במקום לחכות לרגע המושלם." },
  { name: "Nguyễn Minh Anh", language: "Tiếng Việt", lang: "vi", english: "Time is most valuable to me when it brings people closer and makes room for kindness.", native: "Với tôi, thời gian quý giá nhất khi nó giúp mọi người gần gũi hơn và dành chỗ cho lòng tử tế." },
  { name: "Putri Wijaya", language: "Bahasa Indonesia", lang: "id", english: "I joined to make thoughtful choices about how I spend my days and connect with others.", native: "Saya bergabung agar lebih bijak memilih cara menjalani hari dan menjalin hubungan dengan orang lain." },
  { name: "Zofia Nowak", language: "Polski", lang: "pl", english: "TimeNation reminds me that forgiveness and new beginnings also take time and a conscious choice.", native: "TimeNation przypomina mi, że przebaczenie i nowe początki również wymagają czasu i świadomego wyboru." },
  { name: "Eleni Papadopoulou", language: "Ελληνικά", lang: "el", english: "We can make time more meaningful through creativity, memories, and shared responsibility.", native: "Πιστεύω ότι μπορούμε να δώσουμε περισσότερο νόημα στον χρόνο μέσα από τη δημιουργικότητα, τις αναμνήσεις και την κοινή ευθύνη." },
  { name: "Aigerim Nurlan", language: "Қазақша", lang: "kk", english: "I joined to use my time with purpose and contribute to a community that cares for one another.", native: "Мен уақытымды мақсатпен өткізіп, бір-біріне қамқор қауымдастыққа үлес қосқым келгендіктен қосылдым." },
  { name: "Noor de Vries", language: "Nederlands", lang: "nl", english: "Technology can give us time, but we decide what makes that time worthwhile.", native: "Ik ben lid geworden om te onthouden dat technologie ons tijd kan geven, maar dat wij zelf bepalen wat die tijd waardevol maakt." },
];

export function CitizenReviewsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center",
        padding: 16, background: "rgba(0,0,12,0.82)", backdropFilter: "blur(10px)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="citizen-reviews-title"
        style={{
          width: "min(980px, 100%)", maxHeight: "min(88vh, 900px)", overflowY: "auto",
          border: "1px solid rgba(0,212,255,0.35)", borderRadius: 20, padding: "clamp(20px, 4vw, 36px)",
          background: "linear-gradient(145deg, rgba(4,8,30,0.98), rgba(8,7,28,0.98))",
          color: "#e8e8f4", boxShadow: "0 0 60px rgba(0,212,255,0.14)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 8 }}>
          <h2 id="citizen-reviews-title" style={{ margin: 0, color: "#00d4ff", fontFamily: "'Orbitron', monospace", fontSize: "clamp(16px, 3vw, 24px)", lineHeight: 1.4 }}>
            Почему я вступил в гражданство: отзывы граждан
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть отзывы" style={{ border: 0, background: "transparent", color: "#aeb8d0", fontSize: 28, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <p style={{ color: "#aeb8d0", fontSize: 13, lineHeight: 1.5, margin: "0 0 22px" }}>
          Демонстрационные тексты на 24 языках. Имена и отзывы вымышлены.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
          {reviews.map((review) => (
            <article key={review.name} style={{ padding: 16, borderRadius: 14, background: "rgba(0,212,255,0.045)", border: "1px solid rgba(0,212,255,0.14)" }}>
              <div style={{ color: "#c9a84c", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{review.name} <span style={{ color: "#7f8ca8", fontWeight: 400 }}>· {review.language}</span></div>
              <p style={{ color: "#d6d9e8", fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>{review.english}</p>
              <p lang={review.lang} style={{ color: "#9da9c3", fontSize: 13, lineHeight: 1.65, margin: 0 }}>{review.native}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

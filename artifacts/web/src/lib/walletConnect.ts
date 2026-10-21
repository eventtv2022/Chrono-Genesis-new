import { createAppKit } from "@reown/appkit/react";
import { TronAdapter } from "@reown/appkit-adapter-tron";
import { tronMainnet } from "@reown/appkit/networks";

const projectId = "61b154ad546b1f649cb5069193e1ff14";

createAppKit({
  adapters: [new TronAdapter()],
  networks: [tronMainnet],
  projectId,
  metadata: {
    name: "TimeNation",
    description: "Оплата Дарминов через USDT TRC20",
    url: window.location.origin,
    icons: [],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
});

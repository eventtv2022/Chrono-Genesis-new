import { Router, type IRouter } from "express";
import healthRouter from "./health";
import citizensRouter from "./citizens";
import sessionsRouter from "./sessions";
import transactionsRouter from "./transactions";
import timelineRouter from "./timeline";
import paymentsRouter from "./payments";
import walletRouter from "./wallet";
import embassiesRouter from "./embassies";
import auctionsRouter from "./auctions";
import emissionRouter from "./emission";
import tvRouter from "./tv";
import dealsRouter from "./deals";
import chronopediaRouter from "./chronopedia";
import timeBankRouter from "./timeBank";
import governmentRouter from "./government";

const router: IRouter = Router();

router.use(healthRouter);
router.use(citizensRouter);
router.use(sessionsRouter);
router.use(transactionsRouter);
router.use(timelineRouter);
router.use(paymentsRouter);
router.use(walletRouter);
router.use(embassiesRouter);
router.use(auctionsRouter);
router.use(emissionRouter);
router.use(tvRouter);
router.use(dealsRouter);
router.use(chronopediaRouter);
router.use(timeBankRouter);
router.use(governmentRouter);

export default router;

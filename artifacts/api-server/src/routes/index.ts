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

export default router;

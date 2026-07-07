import express from "express";

import healthRouter from "./routes/health.js";

export function createApp() {

    const app = express();

    app.use(express.json());

    app.use("/health", healthRouter);

    app.get("/", (_, res) => {

        res.send("p2pShare Backend");

    });

    return app;

}
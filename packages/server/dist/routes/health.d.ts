import { Router } from "express";
import type { SummarizerPort } from "../ports/index.js";
export declare function healthRouter(summarizer: SummarizerPort): Router;

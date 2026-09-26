import "server-only";
import { db } from "../../infrastructure/database/client";
import { SignInPolicy } from "./SignInPolicy";

export const signInPolicy = new SignInPolicy(db);

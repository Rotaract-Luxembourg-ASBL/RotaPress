"use client";
import { createContext, useContext } from "react";
export const MediaPickerScope = createContext<string | undefined>(undefined);
export const useMediaPickerEvent = () => useContext(MediaPickerScope);

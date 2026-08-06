"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export interface CollectionDetailSummary {
  id: string;
  name: string;
  description?: string | null;
}

interface CollectionDetailContextValue {
  collectionDetail: CollectionDetailSummary | null;
  setCollectionDetail: Dispatch<
    SetStateAction<CollectionDetailSummary | null>
  >;
}

const CollectionDetailContext = createContext<
  CollectionDetailContextValue | undefined
>(undefined);

export function CollectionDetailProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [collectionDetail, setCollectionDetail] =
    useState<CollectionDetailSummary | null>(null);
  const value = useMemo(
    () => ({ collectionDetail, setCollectionDetail }),
    [collectionDetail]
  );

  return (
    <CollectionDetailContext.Provider value={value}>
      {children}
    </CollectionDetailContext.Provider>
  );
}

export function useCollectionDetail(): CollectionDetailContextValue {
  const context = useContext(CollectionDetailContext);
  if (!context) {
    throw new Error(
      "useCollectionDetail must be used within CollectionDetailProvider"
    );
  }
  return context;
}

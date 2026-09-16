import * as React from "react";
import { EditorialPagination } from "@juddges/design-system";

const noop = () => {};

export const Default = () => (
  <EditorialPagination currentPage={1} totalPages={5} onPageChange={noop} className="mt-0" />
);

export const MiddlePage = () => (
  <EditorialPagination currentPage={7} totalPages={24} onPageChange={noop} className="mt-0" />
);

export const LastPage = () => (
  <EditorialPagination currentPage={24} totalPages={24} onPageChange={noop} className="mt-0" />
);

export const WithSummary = () => (
  <EditorialPagination
    currentPage={3}
    totalPages={12}
    totalItems={284}
    itemsPerPage={25}
    itemLabel="judgments"
    onPageChange={noop}
    className="mt-0"
  />
);

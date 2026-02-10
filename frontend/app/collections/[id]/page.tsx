import CollectionClient from "./client";

type CollectionParams = Promise<{ id: string }>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async function CollectionPage({ 
  params 
}: { 
  params: CollectionParams 
}) {
  const { id } = await params;
  
  return <CollectionClient id={id} />;
} 
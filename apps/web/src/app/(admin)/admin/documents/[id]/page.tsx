import { DocumentDetail } from '@/components/admin/documents/DocumentDetail';

export const metadata = { title: 'Document' };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentDetail id={id} />;
}

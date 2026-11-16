import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export default async function CourseHubPage({
  params,
}: {
  params: Promise<{ subjectCourse: string }>;
}) {
  const { subjectCourse } = await params;
  const decoded = decodeURIComponent(subjectCourse);
  return (
    <ModulePlaceholder
      title={`Course Hub · ${decoded}`}
      description="Fall 2026 & Spring 2027 Banner 9 sections, private .ics deadlines, and Simple Syllabus."
      preserveAcrossCampus
    />
  );
}

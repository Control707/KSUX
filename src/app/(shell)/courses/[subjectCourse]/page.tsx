import React from "react";
import { CourseHubView } from "@/components/courses/CourseHubView";

export default async function CourseHubPage({
  params,
}: {
  params: Promise<{ subjectCourse: string }>;
}) {
  const { subjectCourse } = await params;
  return <CourseHubView subjectCourse={decodeURIComponent(subjectCourse)} />;
}

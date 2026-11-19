"use client";
import React from "react";
import { useParams } from "next/navigation";
import { IncidentDetail } from "@/components/safety/IncidentViews";
export default function IncidentDetailsPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  return <IncidentDetail incidentId={incidentId} />;
}

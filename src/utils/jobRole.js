// How a technician's place on a job is worded on screen. The job still carries myRole 'Lead' or 'Helper' (the first technician, or a lead
// of a pair on an older booking, is 'Lead'; every other technician is 'Helper'), but the words shown are "Primary technician" and
// "Technician", because the admin now picks technicians one by one.
export function jobRoleLabel(myRole, isPrimaryLead) {
  return myRole === 'Lead' && isPrimaryLead !== false ? 'Primary technician' : 'Technician';
}

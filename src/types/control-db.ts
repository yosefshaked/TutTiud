export type OrgMembership = {
  org_id: string
  organization_name: string
  role: 'member' | 'admin' | 'owner'
}

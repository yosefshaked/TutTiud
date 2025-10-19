export type OrgMembership = {
  organization_id: string
  organization_name: string
  role: 'member' | 'admin' | 'owner'
}

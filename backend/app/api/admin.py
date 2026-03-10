"""
Phase 4: Admin APIs — teams, users, workflow (who leads whom), team status.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.db.session import get_db
from app.db.models import Team, User, Email
from app.api.deps import get_admin_user

router = APIRouter(dependencies=[Depends(get_admin_user)])


# --- Schemas ---
class TeamOut(BaseModel):
    id: str
    name: str
    slug: str | None
    memberCount: int = 0

    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: str
    email: str
    displayName: str | None = Field(None, alias="displayName")
    role: str
    teamId: str | None = Field(None, alias="teamId")
    teamName: str | None = Field(None, alias="teamName")
    managerId: str | None = Field(None, alias="managerId")
    isTeamLead: bool = Field(False, alias="isTeamLead")
    reportCount: int = 0

    model_config = {"from_attributes": True, "populate_by_name": True}


class WorkflowNode(BaseModel):
    id: str
    email: str
    displayName: str | None
    role: str
    teamName: str | None
    isTeamLead: bool
    managerId: str | None
    reportIds: list[str] = []


class TeamStatusOut(BaseModel):
    teamId: str
    teamName: str
    emailsAssigned: int
    escalationsCount: int
    leadsCount: int


# --- Teams ---
@router.get("/teams", response_model=list[TeamOut])
def list_teams(db: Session = Depends(get_db)):
    """List all teams with member count."""
    teams = db.query(Team).order_by(Team.name).all()
    result = []
    for t in teams:
        count = db.query(User).filter(User.team_id == t.id).count()
        result.append(TeamOut(id=t.id, name=t.name, slug=t.slug, memberCount=count))
    return result


@router.get("/teams/{team_id}", response_model=TeamOut)
def get_team(team_id: str, db: Session = Depends(get_db)):
    """Get team by id with member count."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    count = db.query(User).filter(User.team_id == team.id).count()
    return TeamOut(id=team.id, name=team.name, slug=team.slug, memberCount=count)


@router.get("/teams/{team_id}/status", response_model=TeamStatusOut)
def get_team_status(team_id: str, db: Session = Depends(get_db)):
    """Team status: counts of emails assigned, escalations, leads."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    emails_assigned = db.query(Email).filter(Email.assigned_team == team.name).count() if hasattr(Email, "assigned_team") else 0
    escalations = 0
    leads = 0
    if hasattr(Email, "is_escalation"):
        escalations = db.query(Email).filter(Email.is_escalation == True, Email.assigned_team == team.name).count()
    if hasattr(Email, "lead_label"):
        leads = db.query(Email).filter(Email.lead_label.isnot(None), Email.assigned_team == team.name).count()
    return TeamStatusOut(
        teamId=team.id,
        teamName=team.name,
        emailsAssigned=emails_assigned,
        escalationsCount=escalations,
        leadsCount=leads,
    )


# --- Users ---
@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    role: str | None = Query(None, description="Filter by role: Admin, Manager, Member"),
    team_id: str | None = Query(None, alias="teamId"),
):
    """List users with role, team, manager. Optional filter by role or team."""
    q = db.query(User).order_by(User.email)
    if role and role.strip():
        q = q.filter(User.role == role.strip())
    if team_id and team_id.strip():
        q = q.filter(User.team_id == team_id.strip())
    users = q.all()
    result = []
    for u in users:
        team_name = u.team.name if u.team else None
        report_count = db.query(User).filter(User.manager_id == u.id).count()
        result.append(
            UserOut(
                id=u.id,
                email=u.email,
                displayName=u.display_name,
                role=u.role,
                teamId=u.team_id,
                teamName=team_name,
                managerId=u.manager_id,
                isTeamLead=u.is_team_lead,
                reportCount=report_count,
            )
        )
    return result


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    role: str | None = Query(None),
    team_id: str | None = Query(None, alias="teamId"),
    manager_id: str | None = Query(None, alias="managerId"),
    is_team_lead: bool | None = Query(None, alias="isTeamLead"),
    db: Session = Depends(get_db),
):
    """Update user role, team, manager, or is_team_lead."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if role is not None and role.strip() in ("Admin", "Manager", "Member"):
        user.role = role.strip()
    if team_id is not None:
        if team_id.strip():
            team = db.query(Team).filter(Team.id == team_id.strip()).first()
            if not team:
                raise HTTPException(status_code=400, detail="Team not found")
            user.team_id = team.id
        else:
            user.team_id = None
    if manager_id is not None:
        if manager_id.strip():
            manager = db.query(User).filter(User.id == manager_id.strip()).first()
            if not manager:
                raise HTTPException(status_code=400, detail="Manager user not found")
            user.manager_id = manager.id
        else:
            user.manager_id = None
    if is_team_lead is not None:
        user.is_team_lead = is_team_lead
    db.commit()
    return {"ok": True, "userId": user_id}


@router.post("/users")
def create_user(
    email: str = Query(...),
    display_name: str | None = Query(None, alias="displayName"),
    role: str = Query("Member"),
    team_id: str | None = Query(None, alias="teamId"),
    db: Session = Depends(get_db),
):
    """Create a user (for sync or manual add)."""
    email = email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="User already exists")
    if role not in ("Admin", "Manager", "Member"):
        role = "Member"
    user = User(email=email, display_name=display_name or email.split("@")[0], role=role)
    if team_id and team_id.strip():
        team = db.query(Team).filter(Team.id == team_id.strip()).first()
        if team:
            user.team_id = team.id
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"ok": True, "userId": user.id, "email": user.email}


# --- Workflow (who leads whom) ---
@router.get("/workflow", response_model=list[WorkflowNode])
def get_workflow(db: Session = Depends(get_db)):
    """Return flat list of users with reportIds for building tree (Manager -> members)."""
    users = db.query(User).order_by(User.email).all()
    report_map: dict[str, list[str]] = {}
    for u in users:
        if u.manager_id:
            report_map.setdefault(u.manager_id, []).append(u.id)
    result = []
    for u in users:
        result.append(
            WorkflowNode(
                id=u.id,
                email=u.email,
                displayName=u.display_name,
                role=u.role,
                teamName=u.team.name if u.team else None,
                isTeamLead=u.is_team_lead,
                managerId=u.manager_id,
                reportIds=report_map.get(u.id, []),
            )
        )
    return result

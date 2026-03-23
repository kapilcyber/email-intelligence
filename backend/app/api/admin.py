"""
Phase 4: Admin APIs — teams, users, workflow (who leads whom), team status.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session, aliased
from sqlalchemy.exc import OperationalError, ProgrammingError
from pydantic import BaseModel, Field

from app.db.session import get_db
from app.db.models import Team, User, Email, TeamProject, ProjectAssignment
from app.api.deps import get_admin_user
from app.api.phase3 import _email_to_item
from app.config import get_settings

router = APIRouter(dependencies=[Depends(get_admin_user)])

# Mailboxes to exclude from "Users — escalation count" / "Users — lead count" (e.g. default backfill mailbox already on admin dashboard)
def _excluded_mailboxes_for_user_lists() -> set[str]:
    s = get_settings()
    excluded = set()
    if getattr(s, "mailbox_email", None) and str(s.mailbox_email).strip():
        excluded.add(str(s.mailbox_email).strip().lower())
    # Always exclude techbank (default backfill mailbox) so it does not appear in per-user list
    excluded.add("techbank@cachedigitech.com")
    return excluded


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


class ProjectAssignmentOut(BaseModel):
    userId: str
    email: str
    displayName: str | None = None
    role: str | None = None


class TeamProjectOut(BaseModel):
    id: str
    name: str
    teamId: str | None = None
    teamName: str | None = None
    status: str
    structure: dict | None = None
    assignedUsers: list[ProjectAssignmentOut] = []
    createdAt: datetime
    updatedAt: datetime


class TeamProjectUpsertIn(BaseModel):
    name: str
    teamId: str | None = None
    status: str = "running"
    structure: dict | None = None
    assignedUserIds: list[str] = []


class TeamStatusOut(BaseModel):
    teamId: str
    teamName: str
    emailsAssigned: int
    escalationsCount: int
    leadsCount: int


class UserEscalationCountOut(BaseModel):
    """User with count of escalation emails in their mailbox (for admin escalations-by-user list)."""
    email: str
    displayName: str | None = Field(None, alias="displayName")
    escalationCount: int = Field(0, alias="escalationCount")
    readCount: int = Field(0, alias="readCount")
    unreadCount: int = Field(0, alias="unreadCount")
    repliedCount: int = Field(0, alias="repliedCount")

    model_config = {"populate_by_name": True}


class UserLeadCountOut(BaseModel):
    """User with count of lead emails in their mailbox (for admin leads-by-user list)."""
    email: str
    displayName: str | None = Field(None, alias="displayName")
    leadCount: int = Field(0, alias="leadCount")
    readCount: int = Field(0, alias="readCount")
    unreadCount: int = Field(0, alias="unreadCount")
    repliedCount: int = Field(0, alias="repliedCount")

    model_config = {"populate_by_name": True}


def _serialize_project(db: Session, project: TeamProject) -> TeamProjectOut:
    team_name = project.team.name if getattr(project, "team", None) else None
    assignments = (
        db.query(ProjectAssignment, User)
        .join(User, User.id == ProjectAssignment.user_id)
        .filter(ProjectAssignment.project_id == project.id)
        .order_by(User.email)
        .all()
    )
    users = [
        ProjectAssignmentOut(
            userId=u.id,
            email=u.email,
            displayName=u.display_name,
            role=a.role,
        )
        for a, u in assignments
    ]
    return TeamProjectOut(
        id=project.id,
        name=project.name,
        teamId=project.team_id,
        teamName=team_name,
        status=project.status,
        structure=project.structure if isinstance(project.structure, dict) else None,
        assignedUsers=users,
        createdAt=project.created_at,
        updatedAt=project.updated_at,
    )


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


# --- Projects workflow (admin only) ---
@router.get("/projects-workflow", response_model=list[TeamProjectOut])
def list_projects_workflow(
    db: Session = Depends(get_db),
    team_id: str | None = Query(None, alias="teamId"),
    status: str | None = Query(None),
):
    try:
        q = db.query(TeamProject).order_by(TeamProject.updated_at.desc())
        if team_id and team_id.strip():
            q = q.filter(TeamProject.team_id == team_id.strip())
        if status and status.strip():
            q = q.filter(TeamProject.status == status.strip().lower())
        projects = q.all()
        return [_serialize_project(db, p) for p in projects]
    except (OperationalError, ProgrammingError) as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Projects tables are not in the database yet. From the backend folder run: "
                "alembic upgrade head"
            ),
        ) from e


@router.get("/projects-workflow/{project_id}", response_model=TeamProjectOut)
def get_project_workflow(project_id: str, db: Session = Depends(get_db)):
    """Single project for admin workflow detail view."""
    try:
        project = db.query(TeamProject).filter(TeamProject.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return _serialize_project(db, project)
    except HTTPException:
        raise
    except (OperationalError, ProgrammingError) as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Projects tables are not in the database yet. From the backend folder run: "
                "alembic upgrade head"
            ),
        ) from e


@router.post("/projects-workflow", response_model=TeamProjectOut)
def create_project_workflow(payload: TeamProjectUpsertIn, db: Session = Depends(get_db)):
    try:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Project name is required")
        status = (payload.status or "running").strip().lower()
        if status not in ("running", "new", "planned", "completed"):
            status = "running"
        team_id = (payload.teamId or "").strip() or None
        if team_id:
            team = db.query(Team).filter(Team.id == team_id).first()
            if not team:
                raise HTTPException(status_code=400, detail="Team not found")

        project = TeamProject(
            name=name,
            team_id=team_id,
            status=status,
            structure=payload.structure if isinstance(payload.structure, dict) else None,
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        ids = list({x.strip() for x in (payload.assignedUserIds or []) if isinstance(x, str) and x.strip()})
        if ids:
            users = db.query(User).filter(User.id.in_(ids)).all()
            valid = {u.id for u in users}
            for uid in ids:
                if uid in valid:
                    db.add(ProjectAssignment(project_id=project.id, user_id=uid))
            db.commit()

        return _serialize_project(db, project)
    except HTTPException:
        raise
    except (OperationalError, ProgrammingError) as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Projects tables are not in the database yet. From the backend folder run: "
                "alembic upgrade head"
            ),
        ) from e


@router.patch("/projects-workflow/{project_id}", response_model=TeamProjectOut)
def update_project_workflow(project_id: str, payload: TeamProjectUpsertIn, db: Session = Depends(get_db)):
    try:
        project = db.query(TeamProject).filter(TeamProject.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Project name is required")
        status = (payload.status or "running").strip().lower()
        if status not in ("running", "new", "planned", "completed"):
            status = "running"
        team_id = (payload.teamId or "").strip() or None
        if team_id:
            team = db.query(Team).filter(Team.id == team_id).first()
            if not team:
                raise HTTPException(status_code=400, detail="Team not found")

        project.name = name
        project.status = status
        project.team_id = team_id
        project.structure = payload.structure if isinstance(payload.structure, dict) else None
        db.commit()

        db.query(ProjectAssignment).filter(ProjectAssignment.project_id == project.id).delete()
        ids = list({x.strip() for x in (payload.assignedUserIds or []) if isinstance(x, str) and x.strip()})
        if ids:
            users = db.query(User).filter(User.id.in_(ids)).all()
            valid = {u.id for u in users}
            for uid in ids:
                if uid in valid:
                    db.add(ProjectAssignment(project_id=project.id, user_id=uid))
        db.commit()
        db.refresh(project)
        return _serialize_project(db, project)
    except HTTPException:
        raise
    except (OperationalError, ProgrammingError) as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Projects tables are not in the database yet. From the backend folder run: "
                "alembic upgrade head"
            ),
        ) from e


# --- Escalations by user (admin: list users with counts, then view one user's escalations) ---
@router.get("/escalation-counts", response_model=list[UserEscalationCountOut])
def list_escalation_counts_by_user(db: Session = Depends(get_db)):
    """List all users with their escalation email count and status (read/unread/replied). Excludes default/system mailbox."""
    excluded = _excluded_mailboxes_for_user_lists()
    users = db.query(User).order_by(User.email).all()
    users = [u for u in users if (u.email or "").strip().lower() not in excluded]
    if not hasattr(Email, "is_escalation") or not hasattr(Email, "mailbox_owner_email"):
        return [
            UserEscalationCountOut(
                email=u.email, displayName=u.display_name, escalationCount=0,
                readCount=0, unreadCount=0, repliedCount=0,
            )
            for u in users
        ]
    E2 = aliased(Email)
    result = []
    for u in users:
        base = db.query(Email).filter(
            Email.is_escalation == True,
            Email.mailbox_owner_email == u.email,
        )
        count = base.count()
        read_count = base.filter(Email.is_read == True).count() if hasattr(Email, "is_read") else 0
        unread_count = base.filter(Email.is_read == False).count() if hasattr(Email, "is_read") else 0
        # Replied: distinct escalation conversations where the user has at least one sent message in that thread
        if hasattr(Email, "conversation_id") and hasattr(Email, "folder_id") and hasattr(Email, "folder_name"):
            sent_match = or_(
                E2.folder_id == "sentitems",
                func.coalesce(func.lower(E2.folder_name), "").like("%sent%"),
            )
            replied_exists = exists().where(
                E2.conversation_id == Email.conversation_id,
                E2.mailbox_owner_email == u.email,
                sent_match,
            )
            replied_count = (
                db.query(func.count(func.distinct(Email.conversation_id)))
                .filter(
                    Email.is_escalation == True,
                    Email.mailbox_owner_email == u.email,
                    Email.conversation_id.isnot(None),
                    replied_exists,
                )
                .scalar()
                or 0
            )
        else:
            replied_count = 0
        result.append(UserEscalationCountOut(
            email=u.email,
            displayName=u.display_name,
            escalationCount=count,
            readCount=read_count,
            unreadCount=unread_count,
            repliedCount=replied_count,
        ))
    return result


@router.get("/escalations")
def list_escalations_for_user(
    mailbox: str = Query(..., description="User email (mailbox) to show escalations for"),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    from_date: str | None = Query(None, alias="from"),
    team: str | None = Query(None, description="Filter by assigned team"),
):
    """List escalation emails for a specific user's mailbox. Admin only."""
    mailbox = (mailbox or "").strip().lower()
    if not mailbox or "@" not in mailbox:
        raise HTTPException(status_code=400, detail="Valid mailbox (user email) required")
    try:
        if not hasattr(Email, "is_escalation"):
            return {"escalations": [], "total": 0, "page": page, "pageSize": page_size}
        q = db.query(Email).filter(Email.is_escalation == True, Email.mailbox_owner_email == mailbox)
        if from_date:
            try:
                dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
                q = q.filter(Email.received_at >= dt)
            except ValueError:
                pass
        if team and team.strip() and hasattr(Email, "assigned_team"):
            q = q.filter(Email.assigned_team == team.strip())
        total = q.count()
        rows = q.order_by(Email.received_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {
            "escalations": [_email_to_item(r, include_escalation_reasons=True) for r in rows],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }
    except (OperationalError, Exception):
        return {"escalations": [], "total": 0, "page": page, "pageSize": page_size}


# --- Leads by user (admin: list users with counts, then view one user's leads) ---
@router.get("/lead-counts", response_model=list[UserLeadCountOut])
def list_lead_counts_by_user(db: Session = Depends(get_db)):
    """List all users with their lead email count and status (read/unread/replied). Excludes default/system mailbox."""
    excluded = _excluded_mailboxes_for_user_lists()
    users = db.query(User).order_by(User.email).all()
    users = [u for u in users if (u.email or "").strip().lower() not in excluded]
    if not hasattr(Email, "lead_label") or not hasattr(Email, "mailbox_owner_email"):
        return [
            UserLeadCountOut(
                email=u.email, displayName=u.display_name, leadCount=0,
                readCount=0, unreadCount=0, repliedCount=0,
            )
            for u in users
        ]
    E2 = aliased(Email)
    result = []
    for u in users:
        base = db.query(Email).filter(
            Email.lead_label.isnot(None),
            Email.mailbox_owner_email == u.email,
        )
        count = base.count()
        read_count = base.filter(Email.is_read == True).count() if hasattr(Email, "is_read") else 0
        unread_count = base.filter(Email.is_read == False).count() if hasattr(Email, "is_read") else 0
        if hasattr(Email, "conversation_id") and hasattr(Email, "folder_id") and hasattr(Email, "folder_name"):
            sent_match = or_(
                E2.folder_id == "sentitems",
                func.coalesce(func.lower(E2.folder_name), "").like("%sent%"),
            )
            replied_exists = exists().where(
                E2.conversation_id == Email.conversation_id,
                E2.mailbox_owner_email == u.email,
                sent_match,
            )
            replied_count = (
                db.query(func.count(func.distinct(Email.conversation_id)))
                .filter(
                    Email.lead_label.isnot(None),
                    Email.mailbox_owner_email == u.email,
                    Email.conversation_id.isnot(None),
                    replied_exists,
                )
                .scalar()
                or 0
            )
        else:
            replied_count = 0
        result.append(UserLeadCountOut(
            email=u.email,
            displayName=u.display_name,
            leadCount=count,
            readCount=read_count,
            unreadCount=unread_count,
            repliedCount=replied_count,
        ))
    return result


@router.get("/leads")
def list_leads_for_user(
    mailbox: str = Query(..., description="User email (mailbox) to show leads for"),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    label: str | None = Query(None, description="Filter by lead label: Hot, Warm, Cold"),
    from_date: str | None = Query(None, alias="from"),
    team: str | None = Query(None, description="Filter by assigned team"),
):
    """List lead emails for a specific user's mailbox. Admin only."""
    mailbox = (mailbox or "").strip().lower()
    if not mailbox or "@" not in mailbox:
        raise HTTPException(status_code=400, detail="Valid mailbox (user email) required")
    try:
        if not hasattr(Email, "lead_label"):
            return {"leads": [], "total": 0, "page": page, "pageSize": page_size}
        q = db.query(Email).filter(Email.lead_label.isnot(None), Email.mailbox_owner_email == mailbox)
        if label and label.strip():
            q = q.filter(Email.lead_label == label.strip())
        if from_date:
            try:
                dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
                q = q.filter(Email.received_at >= dt)
            except ValueError:
                pass
        if team and team.strip() and hasattr(Email, "assigned_team"):
            q = q.filter(Email.assigned_team == team.strip())
        total = q.count()
        rows = q.order_by(Email.received_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {
            "leads": [_email_to_item(r, include_lead_label=True) for r in rows],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }
    except (OperationalError, Exception):
        return {"leads": [], "total": 0, "page": page, "pageSize": page_size}


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

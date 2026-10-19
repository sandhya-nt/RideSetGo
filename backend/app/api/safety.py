from __future__ import annotations

from datetime import datetime

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.api.auth import get_current_user
from app.models import User, TrustedContact, SafetyReport

router = APIRouter(prefix="/safety", tags=["safety"])


class TrustedContactCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=7, max_length=30)
    relationship: Optional[str] = Field(default=None, max_length=50)


class TrustedContactUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    phone: Optional[str] = Field(default=None, min_length=7, max_length=30)
    relationship: Optional[str] = Field(default=None, max_length=50)


class TrustedContactOut(BaseModel):
    id: int
    name: str
    phone: str
    relationship: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class SafetyReportCreate(BaseModel):
    ride_id: int | None = None
    category: str = Field(min_length=3, max_length=50)
    description: str = Field(min_length=5, max_length=2000)


class SafetyReportOut(BaseModel):
    id: int
    ride_id: int | None
    category: str
    description: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/contacts", response_model=list[TrustedContactOut])
def list_contacts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(TrustedContact).filter(TrustedContact.user_id == current_user.id).all()


@router.post("/contacts", response_model=TrustedContactOut, status_code=status.HTTP_201_CREATED)
def create_contact(contact_in: TrustedContactCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contact = TrustedContact(
        user_id=current_user.id,
        name=contact_in.name,
        phone=contact_in.phone,
        relationship=contact_in.relationship,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.put("/contacts/{contact_id}", response_model=TrustedContactOut)
def update_contact(
    contact_id: int,
    contact_in: TrustedContactUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a trusted contact (owner only)."""
    contact = db.query(TrustedContact).filter(TrustedContact.id == contact_id, TrustedContact.user_id == current_user.id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    update_data = contact_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(contact, field, value)

    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(contact_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contact = db.query(TrustedContact).filter(TrustedContact.id == contact_id, TrustedContact.user_id == current_user.id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()


@router.get("/reports", response_model=list[SafetyReportOut])
def list_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(SafetyReport).filter(SafetyReport.user_id == current_user.id).all()


@router.post("/reports", response_model=SafetyReportOut, status_code=status.HTTP_201_CREATED)
def create_report(report_in: SafetyReportCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if report_in.ride_id is not None:
        from app.models import Ride
        ride = db.query(Ride).filter(Ride.id == report_in.ride_id, Ride.user_id == current_user.id).first()
        if not ride:
            raise HTTPException(status_code=404, detail="Ride not found")
    report = SafetyReport(
        user_id=current_user.id,
        ride_id=report_in.ride_id,
        category=report_in.category,
        description=report_in.description,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
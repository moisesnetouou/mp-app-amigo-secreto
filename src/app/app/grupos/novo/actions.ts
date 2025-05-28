"use server"

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
// import { redirect } from "next/navigation";
import { Resend } from "resend";

export type CreateGroupState = {
  success: null | boolean;
  message: string
}

export async function createGroup(
  _previousState: CreateGroupState,
  formData: FormData
) {
  const supabase = await createClient()

  const { data: authUser, error: authError } = await supabase.auth.getUser()

  if(authError) {
    return {
      success: false,
      message: "Ocorreu um erro"
    }
  }

  console.log("teste", formData)

  const names = formData.getAll("name")
  const emails = formData.getAll("email")
  const groupName = formData.get("group-name")

  console.log("ma", names)

  const { data: newGroup, error } = await supabase.from("groups").insert({
    name: groupName,
    owner_id: authUser?.user?.id
  })
  .select()
  .single()

  if(error) {
    return {
      success: false,
      message: "Ocorreu um erro ao criar o grupo. Por favor tente novamente."
    }
  }

  const participants = names.map((name, index) => ({
    group_id: newGroup.id,
    name,
    email: emails[index]
  }))

  const { data: createdParticipants, error: errorParticipants } = await supabase
    .from("participants")
    .insert(participants)
    .select()

   if(errorParticipants) {
    return {
      success: false,
      message: "Ocorreu um erro ao adicionar os participantes. Por favor tente novamente."
    }
  }

  const drawnParticipants = drawGroup(createdParticipants)
  
  const { error: errorDraw } = await supabase
    .from("participants")
    .upsert(drawnParticipants)

    if(errorDraw) {
      return {
        success: false,
        message: "Ocorreu um erro ao sortear os participantes. Por favor tente novamente."
      }
    }

    const { error: errorResent } = await sendEmailToParticipants(
      drawnParticipants,
      groupName as string
    )

    if(errorResent) {
      return {
        success: false,
        message: errorResent
      }
    }

    redirect(`/app/grupos/${newGroup.id}`)
}

type Participant = {
  id: string;
  group_id: string;
  name: string;
  email: string;
  assigned_to: string | null;
  created_at: string;
}

function drawGroup(participants: Participant[]) {
  const selectedParticipants: string[] = []

  return participants.map((participant) => {
    const availableParticipants = participants.filter(
      (p) => p.id !== participant.id && !selectedParticipants.includes(p.id)
    )

    const assignedParticipant = availableParticipants[
      Math.floor(Math.random() * availableParticipants.length)
    ]

    selectedParticipants.push(assignedParticipant.id)

    return {
      ...participant,
      assigned_to: assignedParticipant.id
    }
  })
}

async function sendEmailToParticipants(participants: Participant[], groupName: string) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  
  try {
    await Promise.all(
      participants.map(participant => {
        resend.emails.send(
          {
            from: "onboarding@resend.dev",
            to: participant.email,
            subject: `Sorteio de amigo secreto - ${groupName}`,
            html: `
              <h1>Sorteio de amigo secreto</h1>
              <p>Você está participando do amigo secreto do grupo "${groupName}". <br /> <br /></p>
              O seu amigo secreto é o <strong>${
                participants.find(p => p.id === participant.assigned_to)?.name
              }</strong>!</p>
              }
            `
          }
        )
      })
    )

    return { error: null }
  } catch {
    return { error: "Ocorreu um erro ao enviar os emails" }
  }
}
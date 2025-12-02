// Reservation handling logic module (atom)

module.exports = async function handleReservation(data) {

    // Basic validation
    if (!data || !data.name || !data.destination) {
        throw new Error("Missing required fields");
    }

    // OPTIONAL: Save to DB / File / Send email
    // For now, just simulate transporter sequence
    await new Promise(resolve => setTimeout(resolve, 400)); // mini delay

    // Generate fun response
    const response = 
        `🖖 Transporter lock confirmed.
         Passenger: ${data.name}
         Destination: ${data.destination}
         Purpose Registered.
         Matter stream alignment stable.
         
         Waiting authorization...`;

    return response;
}

export async function checkAuth(req, res, next) {
    if(!res.user){
        return res.status(401).json({message: "Unauthorized"})
    }

    
res.status(200).json(req.user)
    
}